import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Search, MapPin, Wind, Droplets, Eye, Thermometer, Sun, Sunset,
  CloudRain, Cloud, Zap, Snowflake, CloudFog, Gauge, Trash2,
  RefreshCw, Download, Database, Plus, Pencil, X, ChevronDown,
  AlertTriangle, CheckCircle2, Loader2, Navigation2
} from 'lucide-react';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ─── Weather icon mapping ────────────────────────────────────────────────────
const WeatherIcon = ({ code, size = 24, className = '' }) => {
  const iconMap = {
    '01': Sun, '02': Cloud, '03': Cloud, '04': Cloud,
    '09': CloudRain, '10': CloudRain, '11': Zap,
    '13': Snowflake, '50': CloudFog,
  };
  const prefix = code?.slice(0, 2);
  const Icon = iconMap[prefix] || Cloud;
  return <Icon size={size} className={className} />;
};

const owmIconUrl = (code) =>
  `https://openweathermap.org/img/wn/${code}@2x.png`;

// ─── Wind direction ──────────────────────────────────────────────────────────
const windDir = (deg) => {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
};

// ─── Temp color ──────────────────────────────────────────────────────────────
const tempColor = (t) => {
  if (t < 0) return '#93c5fd';
  if (t < 10) return '#bae6fd';
  if (t < 20) return '#86efac';
  if (t < 30) return '#fde68a';
  if (t < 38) return '#fb923c';
  return '#f87171';
};

// ─── Toast ───────────────────────────────────────────────────────────────────
const Toast = ({ toasts }) => (
  <div className="toast-container">
    {toasts.map(t => (
      <div key={t.id} className={`toast toast-${t.type}`}>
        {t.type === 'error'   ? <AlertTriangle size={16} /> :
         t.type === 'success' ? <CheckCircle2  size={16} /> :
         <Loader2 size={16} className="spin" />}
        <span>{t.msg}</span>
      </div>
    ))}
  </div>
);

// ─── Stat Card ───────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, unit = '', color }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ color: color || 'var(--accent)' }}>
      <Icon size={18} />
    </div>
    <div className="stat-body">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}<span className="stat-unit"> {unit}</span></span>
    </div>
  </div>
);

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('weather');  // 'weather' | 'history'

  // Weather state
  const [query, setQuery]         = useState('');
  const [current, setCurrent]     = useState(null);
  const [forecast, setForecast]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // History/CRUD state
  const [histLoading, setHistLoading] = useState(false);
  const [queries, setQueries]         = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editModal, setEditModal]         = useState(null);  // row being edited
  const [saveForm, setSaveForm]   = useState({ location: '', date_from: '', date_to: '' });
  const [editForm, setEditForm]   = useState({ location: '', date_from: '', date_to: '' });

  // Toast
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = 'info', duration = 3500) => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), duration);
  }, []);

  // ── Fetch weather ──────────────────────────────────────────────────────────
  const fetchWeather = async (loc) => {
    if (!loc.trim()) return;
    setLoading(true);
    setError('');
    setCurrent(null);
    setForecast([]);
    try {
      const [cur, fore] = await Promise.all([
        axios.get(`${API}/weather/current`, { params: { location: loc } }),
        axios.get(`${API}/weather/forecast`, { params: { location: loc } }),
      ]);
      setCurrent(cur.data);
      setForecast(fore.data);
      setSaveForm(f => ({ ...f, location: cur.data.location }));
    } catch (e) {
      const msg = e.response?.data?.detail || 'Could not fetch weather. Check your location or API key.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGPS = () => {
    if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }
    toast('Getting your location…', 'info', 2000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`;
        setQuery(loc);
        fetchWeather(loc);
      },
      () => toast('Location permission denied', 'error')
    );
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchWeather(query);
  };

  // ── History CRUD ───────────────────────────────────────────────────────────
  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const r = await axios.get(`${API}/queries`);
      setQueries(r.data);
    } catch {
      toast('Could not load history', 'error');
    } finally {
      setHistLoading(false);
    }
  };

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab]);

  const handleSaveQuery = async () => {
    if (!saveForm.location || !saveForm.date_from || !saveForm.date_to) {
      toast('Fill all fields', 'error'); return;
    }
    try {
      await axios.post(`${API}/queries`, saveForm);
      toast('Query saved!', 'success');
      setShowSaveModal(false);
    } catch (e) {
      toast(e.response?.data?.detail || 'Save failed', 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await axios.put(`${API}/queries/${editModal.id}`, editForm);
      toast('Updated!', 'success');
      setEditModal(null);
      loadHistory();
    } catch (e) {
      toast(e.response?.data?.detail || 'Update failed', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this query?')) return;
    try {
      await axios.delete(`${API}/queries/${id}`);
      toast('Deleted', 'success');
      setQueries(q => q.filter(r => r.id !== id));
    } catch {
      toast('Delete failed', 'error');
    }
  };

  const handleExport = (fmt) => {
    window.open(`${API}/queries/export/${fmt}`, '_blank');
  };

  const openEdit = (row) => {
    setEditModal(row);
    setEditForm({ location: row.location, date_from: row.date_from, date_to: row.date_to });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <Toast toasts={toasts} />

      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-dot" />
            <div>
              <h1 className="brand-title">WeatherApp</h1>
              <p className="brand-sub">Built for PM Accelerator · Syed Kamil</p>
            </div>
          </div>
          <nav className="tabs">
            <button className={`tab ${tab==='weather'?'active':''}`} onClick={()=>setTab('weather')}>
              <Sun size={15} /> Weather
            </button>
            <button className={`tab ${tab==='history'?'active':''}`} onClick={()=>setTab('history')}>
              <Database size={15} /> History
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {/* ══ WEATHER TAB ══════════════════════════════════════════════════════ */}
        {tab === 'weather' && (
          <div className="weather-tab">
            {/* Search */}
            <div className="search-wrap">
              <form className="search-bar" onSubmit={handleSearch}>
                <Search size={18} className="search-icon" />
                <input
                  className="search-input"
                  placeholder="City, ZIP code, or coordinates…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <button type="button" className="gps-btn" onClick={handleGPS} title="Use my location">
                  <Navigation2 size={16} />
                </button>
                <button type="submit" className="search-btn">
                  {loading ? <Loader2 size={16} className="spin" /> : 'Search'}
                </button>
              </form>
            </div>

            {/* Error */}
            {error && (
              <div className="error-banner">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="skeleton-wrap">
                <div className="skeleton skeleton-hero" />
                <div className="skeleton-row">
                  {[...Array(4)].map((_,i) => <div key={i} className="skeleton skeleton-stat" />)}
                </div>
              </div>
            )}

            {/* Current weather */}
            {current && !loading && (
              <>
                <div className="hero-card" style={{'--temp-color': tempColor(current.temp)}}>
                  <div className="hero-bg" />
                  <div className="hero-content">
                    <div className="hero-left">
                      <div className="hero-location">
                        <MapPin size={16} />
                        <span>{current.location}</span>
                      </div>
                      <div className="hero-temp" style={{ color: tempColor(current.temp) }}>
                        {Math.round(current.temp)}°
                        <span className="hero-unit">C</span>
                      </div>
                      <div className="hero-feels">Feels like {Math.round(current.feels_like)}°C</div>
                      <div className="hero-desc">{current.description}</div>
                    </div>
                    <div className="hero-right">
                      <img
                        src={owmIconUrl(current.icon)}
                        alt={current.description}
                        className="hero-icon"
                      />
                      <div className="hero-minmax">
                        <span className="temp-high">↑ {Math.round(current.temp_max)}°</span>
                        <span className="temp-low">↓ {Math.round(current.temp_min)}°</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="stats-grid">
                    <StatCard icon={Wind}        label="Wind"       value={`${current.wind_speed} m/s ${windDir(current.wind_deg)}`} />
                    <StatCard icon={Droplets}    label="Humidity"   value={current.humidity} unit="%" color="#7dd3fc" />
                    <StatCard icon={Eye}         label="Visibility" value={current.visibility.toFixed(1)} unit="km" />
                    <StatCard icon={Gauge}       label="Pressure"   value={current.pressure} unit="hPa" color="#a78bfa" />
                    {current.uv_index != null &&
                      <StatCard icon={Sun}      label="UV Index"   value={current.uv_index} color="#fbbf24" />}
                    <StatCard icon={Cloud}       label="Clouds"     value={current.clouds} unit="%" color="var(--text-2)" />
                    <StatCard icon={Sun}         label="Sunrise"    value={new Date(current.sunrise*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} color="#fb923c" />
                    <StatCard icon={Sunset}      label="Sunset"     value={new Date(current.sunset*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} color="#f97316" />
                  </div>

                  {/* Save CTA */}
                  <button className="save-cta" onClick={()=>setShowSaveModal(true)}>
                    <Database size={14} /> Save to History
                  </button>
                </div>

                {/* 5-day forecast */}
                {forecast.length > 0 && (
                  <div className="forecast-section">
                    <h2 className="section-title">5-Day Forecast</h2>
                    <div className="forecast-grid">
                      {forecast.map((day, i) => (
                        <div key={i} className="forecast-card">
                          <div className="forecast-day">
                            {i === 0 ? 'Today' :
                              new Date(day.date).toLocaleDateString('en',{weekday:'short'})}
                          </div>
                          <img
                            src={owmIconUrl(day.icon)}
                            alt={day.description}
                            className="forecast-icon"
                          />
                          <div className="forecast-desc">{day.description}</div>
                          <div className="forecast-temps">
                            <span style={{ color: tempColor(day.temp_max) }}>
                              {Math.round(day.temp_max)}°
                            </span>
                            <span className="forecast-sep">/</span>
                            <span style={{ color: tempColor(day.temp_min), opacity: 0.7 }}>
                              {Math.round(day.temp_min)}°
                            </span>
                          </div>
                          <div className="forecast-meta">
                            <span><Droplets size={11}/> {day.humidity}%</span>
                            <span><Wind size={11}/> {day.wind_speed}m/s</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Empty state */}
            {!current && !loading && !error && (
              <div className="empty-state">
                <div className="empty-icon"><Sun size={48} /></div>
                <p>Enter a location to get started</p>
                <span>Try a city name, ZIP code, or use GPS</span>
              </div>
            )}
          </div>
        )}

        {/* ══ HISTORY TAB ══════════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <div className="history-tab">
            <div className="history-header">
              <h2 className="section-title">Saved Queries</h2>
              <div className="history-actions">
                <div className="export-group">
                  <span className="export-label"><Download size={13}/> Export:</span>
                  {['json','csv','xml','markdown'].map(f => (
                    <button key={f} className="export-btn" onClick={()=>handleExport(f)}>{f}</button>
                  ))}
                </div>
                <button className="btn-primary" onClick={()=>setShowSaveModal(true)}>
                  <Plus size={14}/> New Query
                </button>
                <button className="btn-ghost" onClick={loadHistory} title="Refresh">
                  <RefreshCw size={14} className={histLoading?'spin':''} />
                </button>
              </div>
            </div>

            {histLoading ? (
              <div className="loading-row"><Loader2 size={22} className="spin" /> Loading…</div>
            ) : queries.length === 0 ? (
              <div className="empty-state">
                <Database size={40} />
                <p>No saved queries yet</p>
                <span>Search for weather and save it, or add a query here</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Location</th><th>From</th><th>To</th><th>Saved</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queries.map(row => (
                      <tr key={row.id}>
                        <td className="td-id">{row.id}</td>
                        <td>
                          <div className="td-loc">
                            <MapPin size={12} />{row.location}
                          </div>
                        </td>
                        <td>{row.date_from}</td>
                        <td>{row.date_to}</td>
                        <td className="td-date">
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="action-btn edit" onClick={()=>openEdit(row)}>
                              <Pencil size={13}/>
                            </button>
                            <button className="action-btn delete" onClick={()=>handleDelete(row.id)}>
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <a href="https://www.linkedin.com/company/product-manager-accelerator/" target="_blank" rel="noreferrer">
          PM Accelerator
        </a>
        — empowering the next generation of product leaders
      </footer>

      {/* ── Save Modal ── */}
      {showSaveModal && (
        <Modal title="Save Weather Query" onClose={()=>setShowSaveModal(false)}>
          <label className="form-label">Location</label>
          <input className="form-input" value={saveForm.location}
            onChange={e=>setSaveForm(f=>({...f,location:e.target.value}))}
            placeholder="City or address" />
          <label className="form-label">Date From</label>
          <input className="form-input" type="date" value={saveForm.date_from}
            onChange={e=>setSaveForm(f=>({...f,date_from:e.target.value}))} />
          <label className="form-label">Date To</label>
          <input className="form-input" type="date" value={saveForm.date_to}
            onChange={e=>setSaveForm(f=>({...f,date_to:e.target.value}))} />
          <div className="modal-footer">
            <button className="btn-ghost" onClick={()=>setShowSaveModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveQuery}>Save Query</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {editModal && (
        <Modal title={`Edit Query #${editModal.id}`} onClose={()=>setEditModal(null)}>
          <label className="form-label">Location</label>
          <input className="form-input" value={editForm.location}
            onChange={e=>setEditForm(f=>({...f,location:e.target.value}))} />
          <label className="form-label">Date From</label>
          <input className="form-input" type="date" value={editForm.date_from}
            onChange={e=>setEditForm(f=>({...f,date_from:e.target.value}))} />
          <label className="form-label">Date To</label>
          <input className="form-input" type="date" value={editForm.date_to}
            onChange={e=>setEditForm(f=>({...f,date_to:e.target.value}))} />
          <div className="modal-footer">
            <button className="btn-ghost" onClick={()=>setEditModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleUpdate}>Update</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal">
      <div className="modal-head">
        <h3>{title}</h3>
        <button className="modal-close" onClick={onClose}><X size={18}/></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);
