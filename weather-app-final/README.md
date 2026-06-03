# WeatherApp — PM Accelerator Technical Assessment

**Submitted by:** Syed Kamil  
**Role:** Full Stack (Frontend + Backend)  
**Assessment:** Tech Assessment #1 + #2

---

## Overview

A full-stack weather application with:
- Real-time weather data via OpenWeatherMap API
- 5-day forecast with daily breakdowns
- GPS-based location detection
- Full CRUD operations with SQLite persistence
- Data export in JSON, CSV, XML, and Markdown
- Responsive design across desktop, tablet, and mobile

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React 18, Axios, Lucide Icons     |
| Backend  | Python 3.11, FastAPI, SQLite      |
| API      | OpenWeatherMap (Current + Forecast + Geocoding) |
| Database | SQLite via built-in `sqlite3`     |

---

## Setup & Running

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- Free OpenWeatherMap API key → https://openweathermap.org/api

---

### Backend

```bash
cd backend
pip install -r requirements.txt
export OWM_API_KEY=your_api_key_here   # Windows: set OWM_API_KEY=...
uvicorn main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

---

### Frontend

```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:8000 npm start
# Windows: set REACT_APP_API_URL=http://localhost:8000 && npm start
```

App runs at: `http://localhost:3000`

---

## Features

### Tech Assessment #1 — Frontend
- **Location input** — accepts city names, ZIP codes, and GPS coordinates
- **Current weather** — temperature, feels like, humidity, wind, visibility, pressure, UV index, sunrise/sunset, cloud cover
- **5-day forecast** — daily min/max temps, conditions, humidity, wind speed
- **GPS detection** — one-click current location via browser Geolocation API
- **Weather icons** — OpenWeatherMap icon images
- **Error handling** — graceful messages for invalid locations, API failures, permission denied
- **Responsive design** — fluid grid, adapts to desktop / tablet / mobile

### Tech Assessment #2 — Backend
- **CREATE** — save a location + date range query; validates dates and resolves location via geocoding
- **READ** — list all saved queries; view full detail including raw weather data
- **UPDATE** — edit location, date_from, date_to with re-validation
- **DELETE** — remove any record
- **Export** — download all records as JSON, CSV, XML, or Markdown
- **RESTful API** — full OpenAPI docs at `/docs`

---

## API Endpoints

```
GET  /weather/current?location=...   Current weather
GET  /weather/forecast?location=...  5-day forecast
GET  /queries                        Read all saved queries
POST /queries                        Create new query
GET  /queries/{id}                   Read single query
PUT  /queries/{id}                   Update query
DEL  /queries/{id}                   Delete query
GET  /queries/export/{fmt}           Export (json|csv|xml|markdown)
GET  /health                         Health check
```

---

## Project Structure

```
weather-app/
├── backend/
│   ├── main.py          # FastAPI app — all routes, CRUD, export
│   ├── requirements.txt
│   └── weather.db       # Auto-created SQLite database
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── App.jsx      # Main React component
    │   ├── App.css      # Styling
    │   ├── index.js
    │   └── index.css
    └── package.json
```

---

## About PM Accelerator

[Product Manager Accelerator](https://www.linkedin.com/company/product-manager-accelerator/) is a community that empowers aspiring and current product managers through mentorship, real-world projects, and career development resources — helping individuals break into and grow within the product management field.

---

## Notes

- The app uses **metric units** (°C, m/s, km)
- SQLite database is auto-created on first backend startup
- UV Index requires a separate OWM API call; it silently skips if unavailable on your plan
- CORS is open (`*`) for local development; restrict in production
