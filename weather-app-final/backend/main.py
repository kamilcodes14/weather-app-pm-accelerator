from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
import sqlite3
import json
import csv
import io
import os
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, validator
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
OWM_API_KEY = os.getenv("OWM_API_KEY", "YOUR_OPENWEATHERMAP_API_KEY")
OWM_BASE    = "https://api.openweathermap.org/data/2.5"
OWM_GEO     = "https://api.openweathermap.org/geo/1.0"
DB_PATH     = "weather.db"

# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS weather_queries (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            location    TEXT    NOT NULL,
            lat         REAL,
            lon         REAL,
            date_from   TEXT    NOT NULL,
            date_to     TEXT    NOT NULL,
            weather_data TEXT   NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now')),
            updated_at  TEXT    DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()

# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="WeatherApp API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ───────────────────────────────────────────────────────────────────
class WeatherQueryCreate(BaseModel):
    location: str
    date_from: str
    date_to: str

    @validator("date_from", "date_to")
    def valid_date(cls, v):
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Date must be YYYY-MM-DD")
        return v

    @validator("date_to")
    def date_range_valid(cls, v, values):
        if "date_from" in values:
            if v < values["date_from"]:
                raise ValueError("date_to must be >= date_from")
        return v

class WeatherQueryUpdate(BaseModel):
    location: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None

# ── Helpers ───────────────────────────────────────────────────────────────────
async def geocode(location: str):
    """Resolve any location string → (lat, lon, display_name)."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{OWM_GEO}/direct", params={
            "q": location, "limit": 1, "appid": OWM_API_KEY
        })
        data = r.json()
        if not data:
            raise HTTPException(404, f"Location '{location}' not found")
        return data[0]["lat"], data[0]["lon"], f"{data[0]['name']}, {data[0].get('country','')}"

async def geocode_zip(zip_code: str, country: str = "US"):
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{OWM_GEO}/zip", params={
            "zip": f"{zip_code},{country}", "appid": OWM_API_KEY
        })
        if r.status_code != 200:
            raise HTTPException(404, "ZIP not found")
        d = r.json()
        return d["lat"], d["lon"], d["name"]

# ── Routes: Weather ───────────────────────────────────────────────────────────
@app.get("/weather/current")
async def current_weather(location: str = Query(..., description="City, ZIP, or 'lat,lon'")):
    try:
        if "," in location and all(p.replace(".","").replace("-","").isdigit() for p in location.split(",")):
            lat, lon = map(float, location.split(","))
            display = location
        else:
            lat, lon, display = await geocode(location)

        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{OWM_BASE}/weather", params={
                "lat": lat, "lon": lon, "appid": OWM_API_KEY, "units": "metric"
            })
            if r.status_code != 200:
                raise HTTPException(r.status_code, r.text)
            data = r.json()

        uv_index = None
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                uv_r = await client.get(f"{OWM_BASE}/uvi", params={
                    "lat": lat, "lon": lon, "appid": OWM_API_KEY
                })
                if uv_r.status_code == 200:
                    uv_index = uv_r.json().get("value")
        except Exception:
            pass

        return {
            "location": display,
            "lat": lat, "lon": lon,
            "temp": data["main"]["temp"],
            "feels_like": data["main"]["feels_like"],
            "temp_min": data["main"]["temp_min"],
            "temp_max": data["main"]["temp_max"],
            "humidity": data["main"]["humidity"],
            "pressure": data["main"]["pressure"],
            "visibility": data.get("visibility", 0) / 1000,
            "wind_speed": data["wind"]["speed"],
            "wind_deg": data["wind"].get("deg", 0),
            "weather": data["weather"][0]["main"],
            "description": data["weather"][0]["description"],
            "icon": data["weather"][0]["icon"],
            "sunrise": data["sys"]["sunrise"],
            "sunset": data["sys"]["sunset"],
            "uv_index": uv_index,
            "clouds": data["clouds"]["all"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/weather/forecast")
async def forecast(location: str = Query(...)):
    try:
        if "," in location and all(p.replace(".","").replace("-","").isdigit() for p in location.split(",")):
            lat, lon = map(float, location.split(","))
        else:
            lat, lon, _ = await geocode(location)

        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{OWM_BASE}/forecast", params={
                "lat": lat, "lon": lon, "appid": OWM_API_KEY,
                "units": "metric", "cnt": 40
            })
            raw = r.json()

        # Group into daily buckets (5 days)
        days: dict = {}
        for item in raw["list"]:
            d = item["dt_txt"].split(" ")[0]
            if d not in days:
                days[d] = {"temps": [], "icons": [], "descriptions": [], "humidity": [], "wind": []}
            days[d]["temps"].append(item["main"]["temp"])
            days[d]["icons"].append(item["weather"][0]["icon"])
            days[d]["descriptions"].append(item["weather"][0]["description"])
            days[d]["humidity"].append(item["main"]["humidity"])
            days[d]["wind"].append(item["wind"]["speed"])

        result = []
        for d, v in list(days.items())[:5]:
            from collections import Counter
            icon = Counter(v["icons"]).most_common(1)[0][0]
            desc = Counter(v["descriptions"]).most_common(1)[0][0]
            result.append({
                "date": d,
                "temp_min": round(min(v["temps"]), 1),
                "temp_max": round(max(v["temps"]), 1),
                "icon": icon,
                "description": desc,
                "humidity": round(sum(v["humidity"]) / len(v["humidity"])),
                "wind_speed": round(sum(v["wind"]) / len(v["wind"]), 1),
            })
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Routes: CRUD ──────────────────────────────────────────────────────────────
@app.post("/queries", status_code=201)
async def create_query(body: WeatherQueryCreate):
    try:
        lat, lon, display = await geocode(body.location)
    except HTTPException:
        raise HTTPException(404, f"Location '{body.location}' not found or invalid")

    # Fetch historical-range weather (we use forecast as a proxy for future dates)
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{OWM_BASE}/forecast", params={
            "lat": lat, "lon": lon, "appid": OWM_API_KEY, "units": "metric", "cnt": 40
        })
        weather_data = r.json()

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO weather_queries (location, lat, lon, date_from, date_to, weather_data) VALUES (?,?,?,?,?,?)",
        (display, lat, lon, body.date_from, body.date_to, json.dumps(weather_data))
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return {"id": row_id, "location": display, "lat": lat, "lon": lon,
            "date_from": body.date_from, "date_to": body.date_to}


@app.get("/queries")
async def read_queries():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, location, lat, lon, date_from, date_to, created_at, updated_at FROM weather_queries ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/queries/{query_id}")
async def read_query(query_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM weather_queries WHERE id=?", (query_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Query not found")
    d = dict(row)
    d["weather_data"] = json.loads(d["weather_data"])
    return d


@app.put("/queries/{query_id}")
async def update_query(query_id: int, body: WeatherQueryUpdate):
    conn = get_db()
    row = conn.execute("SELECT * FROM weather_queries WHERE id=?", (query_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Query not found")

    loc     = body.location  or row["location"]
    d_from  = body.date_from or row["date_from"]
    d_to    = body.date_to   or row["date_to"]

    if d_to < d_from:
        conn.close()
        raise HTTPException(400, "date_to must be >= date_from")

    if body.location and body.location != row["location"]:
        try:
            lat, lon, display = await geocode(body.location)
            loc = display
        except HTTPException:
            conn.close()
            raise HTTPException(404, f"Location '{body.location}' not found")
    else:
        lat, lon = row["lat"], row["lon"]

    conn.execute(
        "UPDATE weather_queries SET location=?, lat=?, lon=?, date_from=?, date_to=?, updated_at=datetime('now') WHERE id=?",
        (loc, lat, lon, d_from, d_to, query_id)
    )
    conn.commit()
    conn.close()
    return {"id": query_id, "location": loc, "date_from": d_from, "date_to": d_to}


@app.delete("/queries/{query_id}", status_code=204)
async def delete_query(query_id: int):
    conn = get_db()
    row = conn.execute("SELECT id FROM weather_queries WHERE id=?", (query_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Query not found")
    conn.execute("DELETE FROM weather_queries WHERE id=?", (query_id,))
    conn.commit()
    conn.close()


# ── Routes: Export ────────────────────────────────────────────────────────────
@app.get("/queries/export/{fmt}")
async def export_queries(fmt: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, location, lat, lon, date_from, date_to, created_at FROM weather_queries"
    ).fetchall()
    conn.close()
    data = [dict(r) for r in rows]

    fmt = fmt.lower()
    if fmt == "json":
        return StreamingResponse(
            io.BytesIO(json.dumps(data, indent=2).encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=weather_queries.json"}
        )
    elif fmt == "csv":
        buf = io.StringIO()
        if data:
            writer = csv.DictWriter(buf, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=weather_queries.csv"}
        )
    elif fmt == "xml":
        lines = ["<?xml version='1.0'?><queries>"]
        for r in data:
            lines.append("<query>")
            for k, v in r.items():
                lines.append(f"  <{k}>{v}</{k}>")
            lines.append("</query>")
        lines.append("</queries>")
        return StreamingResponse(
            io.BytesIO("\n".join(lines).encode()),
            media_type="application/xml",
            headers={"Content-Disposition": "attachment; filename=weather_queries.xml"}
        )
    elif fmt == "markdown":
        if data:
            keys = list(data[0].keys())
            lines = ["| " + " | ".join(keys) + " |",
                     "| " + " | ".join(["---"] * len(keys)) + " |"]
            for r in data:
                lines.append("| " + " | ".join(str(r[k]) for k in keys) + " |")
        else:
            lines = ["No data"]
        return StreamingResponse(
            io.BytesIO("\n".join(lines).encode()),
            media_type="text/markdown",
            headers={"Content-Disposition": "attachment; filename=weather_queries.md"}
        )
    else:
        raise HTTPException(400, "Supported formats: json, csv, xml, markdown")


@app.get("/health")
async def health():
    return {"status": "ok"}
