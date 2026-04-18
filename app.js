/* =========================================================
   SKYWATCHER — app.js   (Visual Overhaul Edition)
   ========================================================= */

const API_KEY      = 'd9bc045ebf4570dc2e901bd05755f946';
const BASE_URL     = 'https://api.openweathermap.org/data/2.5';
const GEOCODE_URL  = 'https://api.openweathermap.org/geo/1.0/direct';
const RECENT_KEY   = 'sw_recent_v2';
const UNIT_KEY     = 'sw_unit';

// Berhampur, Odisha default
const DEFAULT_LAT  = 19.3150;
const DEFAULT_LON  = 84.7941;

// ──────────────────────────────────────────
// State
// ──────────────────────────────────────────
let currentUnit         = localStorage.getItem(UNIT_KEY) || 'C';
let rawCelsius          = null;
let rawFeels            = null;
let lightningTimer      = null;
let debounceTimer       = null;
let activeIdx           = -1;
let searchedDisplayName = null;
let currentLat          = null;
let currentLon          = null;
let shootingStarTimer   = null;

// Canvas particle state
let pCanvas = null, pCtx = null;
let particles = [];
let animId    = null;

// ──────────────────────────────────────────
// DOM refs
// ──────────────────────────────────────────
const cityNameEl     = document.getElementById('cityName');
const countryBadgeEl = document.getElementById('countryBadge');
const weatherDateEl  = document.getElementById('weatherDate');
const weatherDescEl  = document.getElementById('weatherDesc');
const tempMainEl     = document.getElementById('tempMain');
const feelsLikeEl    = document.getElementById('feelsLike');
const weatherIconEl  = document.getElementById('weatherIconLarge');
const statHumidity   = document.getElementById('statHumidity');
const statWind       = document.getElementById('statWind');
const statVisibility = document.getElementById('statVisibility');
const statPressure   = document.getElementById('statPressure');
const hourlyChart    = document.getElementById('hourlyChart');
const forecastGrid   = document.getElementById('forecastGrid');
const searchForm     = document.getElementById('searchForm');
const searchInput    = document.getElementById('searchInput');
const geoBtn         = document.getElementById('geoBtn');
const shareBtn       = document.getElementById('shareBtn');
const btnC           = document.getElementById('btnC');
const btnF           = document.getElementById('btnF');
const errorBanner    = document.getElementById('errorBanner');
const errorMsg       = document.getElementById('errorMsg');
const errorClose     = document.getElementById('errorClose');
const suggestionsEl  = document.getElementById('suggestionsDropdown');
const tempTrend      = document.getElementById('tempTrend');
const recentSection  = document.getElementById('recentSection');
const recentChips    = document.getElementById('recentChips');

// Sky refs
const skyEl       = document.getElementById('sky');
const starsEl     = document.getElementById('starsEl');
const moonEl      = document.getElementById('moonEl');
const sunEl       = document.getElementById('sunEl');
const cloudsEl    = document.getElementById('cloudsEl');
const precipEl    = document.getElementById('precipEl');
const lightningEl = document.getElementById('lightningEl');
const fogEl       = document.getElementById('fogEl');
const auroraEl    = document.getElementById('auroraEl');
const skylineEl   = document.getElementById('skylineEl');

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
function initApp() {
  // Restore unit preference
  if (currentUnit === 'F') { btnF.classList.add('active'); btnC.classList.remove('active'); }

  // Init canvas
  pCanvas = document.getElementById('particleCanvas');
  pCtx    = pCanvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Generate skyline once
  generateSkyline();
  window.addEventListener('resize', generateSkyline);

  // Stars
  createStars(200);

  // Recent searches
  renderRecentChips();

  // Geolocation → default
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
      ()  => fetchWeatherByCoords(DEFAULT_LAT, DEFAULT_LON)
    );
  } else {
    fetchWeatherByCoords(DEFAULT_LAT, DEFAULT_LON);
  }
}

// Canvas resize
function resizeCanvas() {
  pCanvas.width  = window.innerWidth;
  pCanvas.height = window.innerHeight;
}

// ═══════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════
async function fetchWeatherByCoords(lat, lon) {
  currentLat = lat; currentLon = lon;
  hideError();
  try {
    const [wRes, fRes, aqiData] = await Promise.all([
      fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
      fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
      fetchAQI(lat, lon)
    ]);
    if (!wRes.ok) {
      if (wRes.status === 401) throw new Error('⏳ API key activating — please refresh in a few minutes!');
      throw new Error(`Weather unavailable (${wRes.status})`);
    }
    const weather  = await wRes.json();
    const forecast = await fRes.json();
    renderAll(weather, forecast, aqiData);
  } catch (err) {
    showError(err.message);
  }
}

async function fetchAQI(lat, lon) {
  try {
    const res  = await fetch(`${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.list?.[0] || null;
  } catch (_) { return null; }
}

// ═══════════════════════════════════════════
// GEOCODING AUTOCOMPLETE
// ═══════════════════════════════════════════
function fetchCitySuggestions(query) {
  if (query.length < 2) { closeSuggestions(); return; }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    try {
      const res     = await fetch(`${GEOCODE_URL}?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEY}`);
      if (!res.ok) return;
      const results = await res.json();
      renderSuggestions(results);
    } catch (_) {}
  }, 300);
}

function renderSuggestions(results) {
  if (!results || !results.length) { closeSuggestions(); return; }
  activeIdx = -1;
  suggestionsEl.innerHTML = results.map((r, i) => `
    <div class="suggestion-item" role="option" data-idx="${i}"
         data-lat="${r.lat}" data-lon="${r.lon}"
         data-name="${r.local_names?.en || r.name}">
      <span class="sug-flag">${countryFlag(r.country)}</span>
      <div class="sug-text">
        <span class="sug-city">${r.local_names?.en || r.name}</span>
        <span class="sug-region">${[r.state, r.country].filter(Boolean).join(', ')}</span>
      </div>
    </div>`
  ).join('');

  suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      searchedDisplayName = item.dataset.name;
      searchInput.value   = item.dataset.name;
      closeSuggestions();
      fetchWeatherByCoords(parseFloat(item.dataset.lat), parseFloat(item.dataset.lon));
    });
  });
  suggestionsEl.classList.remove('hidden');
}

function closeSuggestions() {
  suggestionsEl.classList.add('hidden');
  suggestionsEl.innerHTML = '';
  activeIdx = -1;
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  return code.toUpperCase().split('').map(c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  ).join('');
}

// ═══════════════════════════════════════════
// RENDER CONTROLLER
// ═══════════════════════════════════════════
function renderAll(weather, forecast, aqiData = null) {
  rawCelsius = weather.main.temp;
  rawFeels   = weather.main.feels_like;
  renderCurrent(weather, forecast);
  renderHourly(forecast);
  renderHighlights(weather, aqiData);
  renderForecast(forecast);
  addRecent(searchedDisplayName || weather.name, currentLat, currentLon);

  const night    = isNight(weather);
  const cloudPct = weather.clouds?.all ?? 0;
  setTheme(weather.weather[0].main, night, cloudPct, weather.main.temp,
           weather.sys.sunrise, weather.sys.sunset);
}

// ═══════════════════════════════════════════
// RENDER — CURRENT
// ═══════════════════════════════════════════
function renderCurrent(data, forecast) {
  const { name, sys, main, weather, wind, visibility } = data;
  const displayName = searchedDisplayName || name;
  cityNameEl.innerHTML = displayName;

  if (searchedDisplayName && searchedDisplayName.toLowerCase() !== name.toLowerCase()) {
    countryBadgeEl.textContent = `${sys.country} · near ${name}`;
  } else {
    countryBadgeEl.textContent = sys.country;
  }

  weatherDateEl.textContent = `${formatDate(new Date())} · Updated ${formatTime(new Date())}`;
  weatherDescEl.textContent = weather[0].description;
  weatherIconEl.textContent = getWeatherEmoji(weather[0].main, weather[0].icon);
  feelsLikeEl.textContent   = `Feels like ${displayTemp(main.feels_like)}`;
  tempMainEl.textContent    = displayTemp(main.temp);
  setStat(statHumidity,   `${main.humidity}%`);
  setStat(statWind,       `${Math.round(wind.speed)} m/s · ${windDir(wind.deg || 0)}`);
  setStat(statVisibility, visibility ? `${(visibility/1000).toFixed(1)} km` : 'N/A');
  setStat(statPressure,   `${main.pressure} hPa`);

  // Temperature trend: compare current to 3h future
  const future = forecast?.list?.[1];
  if (future) {
    const diff = future.main.temp - main.temp;
    tempTrend.textContent = diff > 0.5 ? '↑' : diff < -0.5 ? '↓' : '→';
    tempTrend.className   = `temp-trend visible ${diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : ''}`;
  }
}

function setStat(el, val) {
  const v = el.querySelector('.stat-val');
  v.classList.remove('skeleton', 'skeleton-text');
  v.style = '';
  v.textContent = val;
}

// ═══════════════════════════════════════════
// RENDER — HOURLY (SVG Line Chart)
// ═══════════════════════════════════════════
function renderHourly(data) {
  const slots = data.list.slice(0, 8);
  if (!slots.length) return;

  const temps = slots.map(s => s.main.temp);
  const minT  = Math.min(...temps), maxT = Math.max(...temps);
  const range = maxT - minT || 2;

  const W = 700, H = 110, padX = 40, padY = 26;
  const chartW = W - padX * 2, chartH = H - padY * 2;

  const pts = slots.map((slot, i) => ({
    x: padX + (i / (slots.length - 1)) * chartW,
    y: padY + chartH - ((slot.main.temp - minT) / range) * chartH,
    temp: slot.main.temp,
    time: formatHour(new Date(slot.dt * 1000)),
    icon: getWeatherEmoji(slot.weather[0].main, slot.weather[0].icon),
    pop:  slot.pop
  }));

  // Smooth cubic bezier path
  let path = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cpX = (pts[i].x + pts[i+1].x) / 2;
    path += ` C${cpX},${pts[i].y} ${cpX},${pts[i+1].y} ${pts[i+1].x},${pts[i+1].y}`;
  }
  const fill = path + ` L${pts[pts.length-1].x},${H+20} L${padX},${H+20} Z`;

  const dots = pts.map((p, i) => `
    <g class="chart-point" style="animation-delay:${i*0.09}s">
      <circle cx="${p.x}" cy="${p.y}" r="4.5" class="chart-dot"/>
      <text x="${p.x}" y="${p.y - 11}" class="chart-temp" text-anchor="middle">${displayTemp(p.temp)}</text>
      <text x="${p.x}" y="${H + 8}"  class="chart-icon" text-anchor="middle">${p.icon}</text>
      ${p.pop != null && p.pop > 0.1 ? `<text x="${p.x}" y="${H + 22}" text-anchor="middle" style="fill:#7dd3fc;font-size:9px;font-family:Outfit">💧${Math.round(p.pop*100)}%</text>` : ''}
      <text x="${p.x}" y="${H + 36}" class="chart-time" text-anchor="middle">${p.time}</text>
    </g>`).join('');

  hourlyChart.innerHTML = `
    <svg width="100%" height="${H+50}" viewBox="0 0 ${W} ${H+50}" class="hourly-svg" style="min-width:560px">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#7dd3fc" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0"/>
        </linearGradient>
        <filter id="lineGlow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="${fill}" fill="url(#chartFill)"/>
      <path d="${path}" fill="none" stroke="#7dd3fc" stroke-width="2.5" filter="url(#lineGlow)" class="chart-line"/>
      ${dots}
    </svg>`;
}

// ═══════════════════════════════════════════
// RENDER — 5-DAY FORECAST
// ═══════════════════════════════════════════
function renderForecast(data) {
  const byDay = {};
  data.list.forEach(slot => {
    const key = new Date(slot.dt * 1000).toDateString();
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(slot);
  });

  const days = Object.values(byDay).slice(0, 5);
  forecastGrid.innerHTML = days.map((slots, i) => {
    const noon = slots.reduce((best, s) => {
      const h = new Date(s.dt * 1000).getHours();
      return Math.abs(h - 12) < Math.abs(new Date(best.dt * 1000).getHours() - 12) ? s : best;
    });
    const high = Math.max(...slots.map(s => s.main.temp_max));
    const low  = Math.min(...slots.map(s => s.main.temp_min));
    const pop  = Math.max(...slots.map(s => s.pop || 0));
    const dow  = new Date(noon.dt * 1000).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const icon = getWeatherEmoji(noon.weather[0].main, noon.weather[0].icon);
    const precipHtml = pop > 0.1 ? `<div class="forecast-precip">💧 ${Math.round(pop*100)}%</div>` : '';
    return `
      <div class="forecast-card glass" style="animation-delay:${i*0.1}s">
        <span class="forecast-day">${dow}</span>
        <span class="forecast-icon">${icon}</span>
        <span class="forecast-desc">${noon.weather[0].description}</span>
        ${precipHtml}
        <div class="forecast-temps">
          <span class="forecast-high" data-raw="${high}">${displayTemp(high)}</span>
          <span class="forecast-low"  data-raw="${low}">${displayTemp(low)}</span>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// UNIT TOGGLE
// ═══════════════════════════════════════════
function displayTemp(c) {
  return currentUnit === 'C' ? `${Math.round(c)}°C` : `${Math.round(c * 9/5 + 32)}°F`;
}
function refreshTemps() {
  if (rawCelsius === null) return;
  tempMainEl.textContent  = displayTemp(rawCelsius);
  feelsLikeEl.textContent = `Feels like ${displayTemp(rawFeels)}`;
  document.querySelectorAll('.chart-temp').forEach(el => {
    // SVG text — we'll re-render hourly on unit toggle via refreshTemps injecting
  });
  document.querySelectorAll('[data-raw]').forEach(el => {
    const r = parseFloat(el.dataset.raw);
    if (!isNaN(r)) el.textContent = displayTemp(r);
  });
}

// ═══════════════════════════════════════════
// HIGHLIGHTS — RENDER
// ═══════════════════════════════════════════
function renderHighlights(weather, aqiData) {
  const { main, wind, clouds, sys } = weather;
  const sunrise  = formatTime(new Date(sys.sunrise * 1000));
  const sunset   = formatTime(new Date(sys.sunset  * 1000));
  const minT     = displayTemp(main.temp_min);
  const maxT     = displayTemp(main.temp_max);
  const dp       = Math.round(dewPoint(main.temp, main.humidity));
  const wdir     = windDir(wind.deg || 0);
  const cloudPct = clouds.all;
  const aqiIdx   = aqiData?.main?.aqi || 0;
  const aqi      = getAQIInfo(aqiIdx);
  const aqiPct   = aqiIdx ? ((aqiIdx - 1) / 4) * 100 : 0;
  const pm25     = aqiData?.components?.pm2_5?.toFixed(1);

  const cards = [
    `<div class="highlight-card glass" style="animation-delay:0s">
      <div class="hl-label">☀️ Sunrise &amp; Sunset</div>
      <div class="sun-split">
        <div class="sun-item"><span class="sun-emoji">🌅</span><span class="sun-time">${sunrise}</span><span class="sun-tag">Sunrise</span></div>
        <div class="sun-item"><span class="sun-emoji">🌇</span><span class="sun-time">${sunset}</span><span class="sun-tag">Sunset</span></div>
      </div>
    </div>`,

    `<div class="highlight-card glass" style="animation-delay:0.08s">
      <div class="hl-label">🌿 Air Quality Index</div>
      <div class="hl-body">
        <span class="hl-value" style="color:${aqi.color}">${aqiIdx || '—'}</span>
        <span class="hl-unit">${aqi.emoji} ${aqi.label}</span>
      </div>
      ${aqiIdx
        ? `<div class="aqi-track"><div class="aqi-dot" style="left:${aqiPct}%"></div></div>
           <div class="hl-sub">${pm25 ? `PM2.5: ${pm25} μg/m³` : ''}</div>`
        : '<div class="hl-sub">Data unavailable</div>'}
    </div>`,

    `<div class="highlight-card glass" style="animation-delay:0.16s">
      <div class="hl-label">🌡️ Today's Range</div>
      <div class="hl-body"><span class="hl-value">${maxT}</span></div>
      <div class="hl-sub">Low: ${minT}</div>
    </div>`,

    `<div class="highlight-card glass" style="animation-delay:0.24s">
      <div class="hl-label">💦 Dew Point</div>
      <div class="hl-body"><span class="hl-value">${dp}</span><span class="hl-unit">°C</span></div>
      <div class="hl-sub">${main.humidity}% humidity · ${dp < 10 ? 'Dry' : dp < 16 ? 'Comfortable' : dp < 21 ? 'Humid' : 'Very Humid'}</div>
    </div>`,

    `<div class="highlight-card glass" style="animation-delay:0.32s">
      <div class="hl-label">🧭 Wind</div>
      <div class="wind-info">
        <div class="compass">
          <span class="compass-lbl n">N</span><span class="compass-lbl s">S</span>
          <span class="compass-lbl e">E</span><span class="compass-lbl w">W</span>
          <div class="compass-arrow" style="transform:rotate(${wind.deg || 0}deg)"></div>
        </div>
        <div class="wind-detail">
          <span class="wind-spd">${Math.round(wind.speed)}</span>
          <span class="wind-spd-u">m/s</span>
          <span class="wind-dir-lbl">${wdir}</span>
        </div>
      </div>
    </div>`,

    `<div class="highlight-card glass" style="animation-delay:0.4s">
      <div class="hl-label">☁️ Cloud Cover</div>
      <div class="hl-body"><span class="hl-value">${cloudPct}</span><span class="hl-unit">%</span></div>
      <div class="hl-sub">${cloudPct < 15 ? '🌞 Clear' : cloudPct < 40 ? '⛅ Partly cloudy' : cloudPct < 75 ? '🌥️ Mostly cloudy' : '☁️ Overcast'}</div>
    </div>`
  ];

  document.getElementById('highlightsGrid').innerHTML = cards.join('');
}

// ═══════════════════════════════════════════
// CITY SKYLINE GENERATOR
// ═══════════════════════════════════════════
function generateSkyline(dark = true) {
  const W = window.innerWidth;
  const H = 200;
  const bldColor  = 'rgba(5,10,20,0.92)';
  const winColorD = 'rgba(255,230,100,0.8)';  // night windows lit
  const winColorL = 'rgba(200,220,235,0.5)';  // day windows (reflective)

  let blds = '', wins = '';
  let x = 0;

  while (x < W + 100) {
    const bw = 28 + Math.random() * 65;
    const bh = 35 + Math.random() * 130;
    const y  = H - bh;
    blds += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="${bldColor}"/>`;

    // Add antenna on tall buildings
    if (bh > 100 && Math.random() > 0.5) {
      const ax = (x + bw/2).toFixed(0);
      blds += `<rect x="${ax}" y="${(y - 18).toFixed(0)}" width="2" height="18" fill="${bldColor}"/>`;
    }

    const wCols = Math.max(1, Math.floor(bw / 13));
    const wRows = Math.max(1, Math.floor(bh / 18));
    for (let row = 0; row < wRows - 1; row++) {
      for (let col = 0; col < wCols - 1; col++) {
        if (Math.random() > 0.38) {
          const wx = (x + 4 + col * 13).toFixed(0);
          const wy = (y + 7 + row * 18).toFixed(0);
          const delay = (Math.random() * 8).toFixed(2);
          const lit   = dark ? Math.random() > 0.3 : Math.random() > 0.85;
          if (lit) {
            wins += `<rect class="bld-win" x="${wx}" y="${wy}" width="7" height="9"
              style="animation-delay:${delay}s;animation-duration:${(4+Math.random()*6).toFixed(1)}s"
              fill="${dark ? winColorD : winColorL}"/>`;
          }
        }
      }
    }
    x += bw + (Math.random() > 0.8 ? 1 : 0);
  }

  skylineEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         preserveAspectRatio="none" width="100%" height="${H}">
      <g>${blds}</g>
      <g>${wins}</g>
    </svg>`;
}

// ═══════════════════════════════════════════
// CANVAS PARTICLE SYSTEM
// ═══════════════════════════════════════════
function stopParticles() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  particles = [];
  if (pCtx) pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  clearTimeout(shootingStarTimer);
}

/* ── Rain ── */
function startRainCanvas(intensity = 200, heavy = false) {
  stopParticles();
  for (let i = 0; i < intensity; i++) {
    particles.push({
      type: 'rain',
      x: Math.random() * pCanvas.width * 1.3,
      y: Math.random() * pCanvas.height,
      len:   12 + Math.random() * 22,
      speed: 14 + Math.random() * 12 + (heavy ? 6 : 0),
      angle: heavy ? 18 : 8,   // degrees of lean
      op: 0.3 + Math.random() * 0.4,
      w: heavy ? 1.2 : 0.9
    });
  }
  (function loop() {
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    const rad = (particles[0]?.angle || 8) * Math.PI / 180;
    particles.forEach(p => {
      pCtx.beginPath();
      pCtx.strokeStyle = `rgba(140,190,230,${p.op})`;
      pCtx.lineWidth   = p.w;
      pCtx.moveTo(p.x, p.y);
      pCtx.lineTo(p.x + Math.sin(rad) * p.len, p.y + p.len);
      pCtx.stroke();
      p.y += p.speed;
      p.x += Math.sin(rad) * p.speed * 0.4;
      if (p.y > pCanvas.height + 30) {
        p.y = -p.len - Math.random() * 60;
        p.x = Math.random() * pCanvas.width * 1.3;
      }
    });
    animId = requestAnimationFrame(loop);
  })();
}

/* ── Snow ── */
function startSnowCanvas(intensity = 100) {
  stopParticles();
  for (let i = 0; i < intensity; i++) {
    const r = 1.5 + Math.random() * 3.5;
    particles.push({
      type: 'snow',
      x: Math.random() * pCanvas.width,
      y: Math.random() * pCanvas.height,
      r, speed: 0.4 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 0.4,
      phase: Math.random() * Math.PI * 2,
      op: 0.45 + Math.random() * 0.5
    });
  }
  (function loop() {
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    particles.forEach(p => {
      p.phase += 0.018;
      p.y     += p.speed;
      p.x     += Math.sin(p.phase) * 0.6 + p.drift;
      if (p.y > pCanvas.height + 10) { p.y = -10; p.x = Math.random() * pCanvas.width; }
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fillStyle = `rgba(220,240,255,${p.op})`;
      pCtx.fill();
    });
    animId = requestAnimationFrame(loop);
  })();
}

/* ── Fireflies (clear warm night) ── */
function startFireflies(count = 50) {
  stopParticles();
  for (let i = 0; i < count; i++) {
    particles.push({
      type: 'firefly',
      x: Math.random() * pCanvas.width,
      y: 40 + Math.random() * (pCanvas.height * 0.65),
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.02 + Math.random() * 0.04,
      r: 1.5 + Math.random() * 2
    });
  }
  (function loop() {
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    particles.forEach(p => {
      p.phase += p.phaseSpeed;
      p.x     += p.vx + Math.sin(p.phase * 0.7) * 0.3;
      p.y     += p.vy + Math.cos(p.phase * 0.5) * 0.25;
      // Bounce at edges
      if (p.x < 0 || p.x > pCanvas.width)  p.vx *= -1;
      if (p.y < 30 || p.y > pCanvas.height * 0.75) p.vy *= -1;

      const glowOp = (Math.sin(p.phase) + 1) / 2; // 0–1
      if (glowOp > 0.05) {
        // Glow halo
        const grad = pCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        grad.addColorStop(0,   `rgba(120,255,100,${glowOp * 0.5})`);
        grad.addColorStop(1,   'rgba(120,255,100,0)');
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        pCtx.fillStyle = grad; pCtx.fill();
        // Core dot
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        pCtx.fillStyle = `rgba(180,255,160,${glowOp})`;
        pCtx.fill();
      }
    });
    animId = requestAnimationFrame(loop);
  })();
}

/* ── Shooting stars ── */
function scheduleShootingStar() {
  clearTimeout(shootingStarTimer);
  function shoot() {
    const sw    = pCanvas.width;
    const sh    = pCanvas.height;
    const startX = Math.random() * sw * 0.7;
    const startY = Math.random() * sh * 0.3;
    const len   = 120 + Math.random() * 160;
    const angle = 25 + Math.random() * 30; // degrees
    const rad   = angle * Math.PI / 180;
    const speedStar = 12 + Math.random() * 8;
    let t = 0, maxT = len / speedStar;

    function drawStar() {
      if (t > maxT) {
        shootingStarTimer = setTimeout(shoot, 8000 + Math.random() * 14000);
        return;
      }
      const progress = t / maxT;
      const tailX = startX + Math.cos(rad) * (t * speedStar);
      const tailY = startY + Math.sin(rad) * (t * speedStar);
      const headX = tailX + Math.cos(rad) * Math.min(len, (maxT - t) * speedStar);
      const headY = tailY + Math.sin(rad) * Math.min(len, (maxT - t) * speedStar);

      // Draw over existing frame (no clear — just compositing)
      pCtx.save();
      pCtx.globalCompositeOperation = 'lighter';
      const grad = pCtx.createLinearGradient(tailX, tailY, headX, headY);
      grad.addColorStop(0,   'rgba(255,255,255,0)');
      grad.addColorStop(0.6, `rgba(255,255,240,${0.6 * (1 - progress)})`);
      grad.addColorStop(1,   `rgba(255,255,255,${1 - progress})`);
      pCtx.beginPath();
      pCtx.strokeStyle = grad;
      pCtx.lineWidth   = 1.5;
      pCtx.moveTo(tailX, tailY);
      pCtx.lineTo(headX, headY);
      pCtx.stroke();
      pCtx.restore();
      t++;
      requestAnimationFrame(drawStar);
    }
    drawStar();
  }
  shootingStarTimer = setTimeout(shoot, 4000 + Math.random() * 8000);
}

// ═══════════════════════════════════════════
// AURORA
// ═══════════════════════════════════════════
function showAurora()  { auroraEl.classList.remove('hidden'); requestAnimationFrame(() => auroraEl.classList.add('visible')); }
function hideAurora()  { auroraEl.classList.remove('visible'); setTimeout(() => auroraEl.classList.add('hidden'), 3000); }

// ═══════════════════════════════════════════
// STARS (CSS)
// ═══════════════════════════════════════════
function createStars(count = 200) {
  starsEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const s    = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2.5 + 0.3;
    s.style.cssText = `
      left: ${Math.random() * 100}%; top: ${Math.random() * 80}%;
      width: ${size}px; height: ${size}px;
      animation-delay: ${Math.random() * 6}s;
      animation-duration: ${2 + Math.random() * 4}s;
    `;
    starsEl.appendChild(s);
  }
}

// ═══════════════════════════════════════════
// CLOUDS (CSS)
// ═══════════════════════════════════════════
function createClouds(count, dark = false) {
  cloudsEl.innerHTML = '';
  const clr = dark ? 'rgba(20,30,50,' : 'rgba(255,255,255,';
  for (let i = 0; i < count; i++) {
    const cloud = document.createElement('div');
    cloud.className = 'cloud';
    const w     = 130 + Math.random() * 190;
    const h     = w * 0.38;
    const speed = 35 + Math.random() * 55;
    const op    = dark ? (0.55 + Math.random() * 0.35) : (0.7 + Math.random() * 0.25);
    cloud.style.cssText = `width:${w}px;height:${h}px;top:${2+Math.random()*38}%;background:${clr}${op});animation-duration:${speed}s;animation-delay:-${Math.random()*speed}s;`;
    const b1 = document.createElement('div'); b1.className = 'cloud-bump';
    b1.style.cssText = `width:${h*1.9}px;height:${h*1.9}px;top:${-h*.95}px;left:${w*.12}px;background:${clr}${op});`;
    const b2 = document.createElement('div'); b2.className = 'cloud-bump';
    b2.style.cssText = `width:${h*1.4}px;height:${h*1.4}px;top:${-h*.65}px;left:${w*.48}px;background:${clr}${op});`;
    cloud.appendChild(b1); cloud.appendChild(b2);
    cloudsEl.appendChild(cloud);
  }
}

// ═══════════════════════════════════════════
// LIGHTNING
// ═══════════════════════════════════════════
function startLightning() {
  lightningEl.classList.remove('hidden');
  function flash() {
    lightningEl.style.background = `rgba(210,225,255,${0.35 + Math.random() * 0.45})`;
    setTimeout(() => {
      lightningEl.style.background = 'rgba(210,225,255,0)';
      if (Math.random() > 0.4) {
        setTimeout(() => {
          lightningEl.style.background = `rgba(210,225,255,${0.15 + Math.random() * 0.25})`;
          setTimeout(() => { lightningEl.style.background = 'rgba(210,225,255,0)'; }, 60);
        }, 110);
      }
      lightningTimer = setTimeout(flash, 2000 + Math.random() * 6000);
    }, 55 + Math.random() * 90);
  }
  flash();
}
function stopLightning() {
  clearTimeout(lightningTimer);
  lightningEl.style.background = 'rgba(210,225,255,0)';
  lightningEl.classList.add('hidden');
}

// ═══════════════════════════════════════════
// SUN / MOON POSITIONING
// ═══════════════════════════════════════════
function positionSun(sunriseTs, sunsetTs) {
  const pct = Math.max(0, Math.min(1, (Date.now()/1000 - sunriseTs) / (sunsetTs - sunriseTs)));
  sunEl.style.left = `${5 + pct * 88}%`;
  sunEl.style.top  = `${78 - Math.sin(pct * Math.PI) * 66}%`;
}
function positionMoon(sunsetTs, sunriseTs) {
  const nightDur = (sunriseTs + 86400) - sunsetTs;
  const pct = Math.max(0, Math.min(1, (Date.now()/1000 - sunsetTs) / nightDur));
  moonEl.style.left = `${5 + pct * 88}%`;
  moonEl.style.top  = `${78 - Math.sin(pct * Math.PI) * 62}%`;
}

// ═══════════════════════════════════════════
// CLOUD COUNT
// ═══════════════════════════════════════════
function cloudCount(pct) {
  if (pct < 15) return 0; if (pct < 35) return 1;
  if (pct < 55) return 2; if (pct < 75) return 4; return 6;
}

// ═══════════════════════════════════════════
// FULL SKY CLEAR
// ═══════════════════════════════════════════
function clearSky() {
  stopParticles();
  stopLightning();
  hideAurora();
  sunEl.classList.add('hidden');
  moonEl.classList.add('hidden');
  starsEl.style.opacity = '0';
  cloudsEl.innerHTML    = '';
  precipEl.innerHTML    = '';
  fogEl.classList.add('hidden');
  document.body.classList.remove(
    'sky-clear-day','sky-clear-night','sky-cloudy-day','sky-cloudy-night',
    'sky-rain','sky-rain-night','sky-drizzle','sky-thunder',
    'sky-snow-day','sky-snow-night','sky-mist','sky-haze'
  );
}

// ═══════════════════════════════════════════
// MAIN THEME SETTER
// ═══════════════════════════════════════════
function setTheme(condition, night, cloudPct, tempC, sunriseTs, sunsetTs) {
  clearSky();
  const cld = cloudCount(cloudPct);
  // Regenerate skyline with correct window-lighting mode
  generateSkyline(night);

  if (!night) {
    switch (condition) {
      case 'Clear':
        document.body.classList.add('sky-clear-day');
        sunEl.classList.remove('hidden'); positionSun(sunriseTs, sunsetTs);
        if (cld > 0) createClouds(cld, false);
        break;
      case 'Clouds':
        document.body.classList.add('sky-cloudy-day');
        if (cloudPct < 60) { sunEl.classList.remove('hidden'); sunEl.style.opacity='0.6'; positionSun(sunriseTs, sunsetTs); }
        createClouds(Math.max(cld, 2), false);
        break;
      case 'Drizzle':
        document.body.classList.add('sky-drizzle');
        createClouds(3, true); startRainCanvas(60);
        break;
      case 'Rain':
        document.body.classList.add('sky-rain');
        createClouds(5, true); startRainCanvas(200, true);
        break;
      case 'Thunderstorm':
        document.body.classList.add('sky-thunder');
        createClouds(6, true); startRainCanvas(240, true); startLightning();
        break;
      case 'Snow':
        document.body.classList.add('sky-snow-day');
        if (cloudPct < 50) { sunEl.classList.remove('hidden'); sunEl.style.opacity='0.5'; positionSun(sunriseTs, sunsetTs); }
        createClouds(Math.max(cld, 2), false); startSnowCanvas(90);
        break;
      default:
        document.body.classList.add(condition === 'Haze' ? 'sky-haze' : 'sky-mist');
        fogEl.classList.remove('hidden');
        if (cloudPct < 60) { sunEl.classList.remove('hidden'); sunEl.style.opacity='0.4'; positionSun(sunriseTs, sunsetTs); }
    }
  } else {
    const starOp = Math.max(0.05, 1 - cloudPct / 100);
    switch (condition) {
      case 'Clear':
        document.body.classList.add('sky-clear-night');
        starsEl.style.opacity = starOp.toFixed(2);
        moonEl.classList.remove('hidden'); moonEl.style.opacity = '1';
        positionMoon(sunsetTs, sunriseTs);
        if (cld > 0) createClouds(cld, true);
        scheduleShootingStar();
        // Aurora: cold night
        if (tempC < 15) showAurora();
        // Fireflies: warm night
        else if (tempC > 22) startFireflies(45);
        break;
      case 'Clouds':
        document.body.classList.add('sky-cloudy-night');
        starsEl.style.opacity = (starOp * 0.55).toFixed(2);
        moonEl.classList.remove('hidden');
        moonEl.style.opacity = cloudPct > 70 ? '0.3' : '0.7';
        positionMoon(sunsetTs, sunriseTs);
        createClouds(Math.max(cld, 2), true);
        scheduleShootingStar();
        break;
      case 'Drizzle':
        document.body.classList.add('sky-rain-night');
        createClouds(3, true); startRainCanvas(70);
        break;
      case 'Rain':
        document.body.classList.add('sky-rain-night');
        createClouds(5, true); startRainCanvas(200, true);
        break;
      case 'Thunderstorm':
        document.body.classList.add('sky-thunder');
        createClouds(6, true); startRainCanvas(240, true); startLightning();
        break;
      case 'Snow':
        document.body.classList.add('sky-snow-night');
        starsEl.style.opacity = (starOp * 0.35).toFixed(2);
        moonEl.classList.remove('hidden');
        moonEl.style.opacity = cloudPct > 70 ? '0.25' : '0.5';
        positionMoon(sunsetTs, sunriseTs);
        createClouds(Math.max(cld, 2), true); startSnowCanvas(90);
        break;
      default:
        document.body.classList.add('sky-mist');
        fogEl.classList.remove('hidden'); starsEl.style.opacity = '0.08';
    }
  }
}

// ═══════════════════════════════════════════
// RECENT SEARCHES
// ═══════════════════════════════════════════
function getRecent() { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }

function addRecent(name, lat, lon) {
  if (!name || !lat || !lon) return;
  let list = getRecent().filter(r => r.name !== name);
  list.unshift({ name, lat, lon });
  if (list.length > 5) list = list.slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  renderRecentChips();
}

function renderRecentChips() {
  const list = getRecent();
  if (!list.length) { recentSection.style.display = 'none'; return; }
  recentSection.style.display = '';
  recentChips.innerHTML = list.map(r =>
    `<button class="recent-chip" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.name}">
       <span>🕓</span>${r.name}
     </button>`
  ).join('');
  recentChips.querySelectorAll('.recent-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      searchedDisplayName = btn.dataset.name;
      searchInput.value   = btn.dataset.name;
      fetchWeatherByCoords(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon));
    });
  });
}

// ═══════════════════════════════════════════
// SHARE WEATHER
// ═══════════════════════════════════════════
function shareWeather() {
  if (rawCelsius === null) return;
  const city = cityNameEl.textContent || 'Unknown';
  const desc = weatherDescEl.textContent;
  const temp = displayTemp(rawCelsius);
  const text = `🌤 ${city}: ${temp}, ${desc} — via Skywatcher`;
  navigator.clipboard.writeText(text)
    .then(() => showToast('✅ Copied to clipboard!'))
    .catch(() => showToast('❌ Could not copy'));
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function isNight(data) { return data.dt < data.sys.sunrise || data.dt > data.sys.sunset; }
function formatDate(d) { return d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }
function formatHour(d) { return d.toLocaleTimeString('en-US', { hour:'numeric', hour12:true }); }
function formatTime(d) { return d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true }); }

function windDir(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
function dewPoint(tempC, humidity) {
  const a = 17.62, b = 243.12;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
  return (b * alpha) / (a - alpha);
}
function getAQIInfo(idx) {
  const d = [null,
    { label:'Good',      emoji:'😊', color:'#4caf50' },
    { label:'Fair',      emoji:'🙂', color:'#8bc34a' },
    { label:'Moderate',  emoji:'😐', color:'#ff9800' },
    { label:'Poor',      emoji:'😷', color:'#f44336' },
    { label:'Very Poor', emoji:'🤢', color:'#9c27b0' }
  ];
  return d[idx] || { label:'N/A', emoji:'', color:'#fff' };
}

function displayTemp(c) {
  return currentUnit === 'C' ? `${Math.round(c)}°C` : `${Math.round(c * 9/5 + 32)}°F`;
}
function refreshTemps() {
  if (rawCelsius === null) return;
  tempMainEl.textContent  = displayTemp(rawCelsius);
  feelsLikeEl.textContent = `Feels like ${displayTemp(rawFeels)}`;
  document.querySelectorAll('[data-raw]').forEach(el => {
    const r = parseFloat(el.dataset.raw);
    if (!isNaN(r)) el.textContent = displayTemp(r);
  });
}

function getWeatherEmoji(main, icon) {
  const n = icon?.endsWith('n');
  const m = {
    Clear:'☀️', Clouds:'⛅', Rain:'🌧️', Drizzle:'🌦️',
    Thunderstorm:'⛈️', Snow:'❄️', Mist:'🌫️', Smoke:'🌫️',
    Haze:'🌫️', Fog:'🌫️', Dust:'🌪️', Sand:'🌪️', Tornado:'🌪️',
  };
  if (main === 'Clear' && n) return '🌙';
  if (main === 'Clouds' && n) return '☁️';
  return m[main] || '🌤️';
}

function showError(msg) { errorMsg.textContent = msg; errorBanner.classList.remove('hidden'); }
function hideError()    { errorBanner.classList.add('hidden'); }

// ═══════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════

// Search submit → geocode → fetch by coords
searchForm.addEventListener('submit', async e => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  closeSuggestions(); searchInput.blur();
  try {
    const res     = await fetch(`${GEOCODE_URL}?q=${encodeURIComponent(query)}&limit=1&appid=${API_KEY}`);
    const results = await res.json();
    if (results.length) {
      searchedDisplayName = query;
      fetchWeatherByCoords(results[0].lat, results[0].lon);
    } else {
      showError('City not found. Try a different spelling or select a suggestion.');
    }
  } catch (_) { showError('Something went wrong. Please try again.'); }
});

// Typing → autocomplete
searchInput.addEventListener('input', e => fetchCitySuggestions(e.target.value.trim()));

// Keyboard nav in suggestions
searchInput.addEventListener('keydown', e => {
  const items = suggestionsEl.querySelectorAll('.suggestion-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIdx = Math.min(activeIdx + 1, items.length - 1);
    items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
    items[activeIdx]?.scrollIntoView({ block:'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx = Math.max(activeIdx - 1, 0);
    items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
    items[activeIdx]?.scrollIntoView({ block:'nearest' });
  } else if (e.key === 'Escape') {
    closeSuggestions();
  } else if (e.key === 'Enter' && activeIdx >= 0) {
    e.preventDefault();
    items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
  }
});

document.addEventListener('click', e => { if (!e.target.closest('.search-form')) closeSuggestions(); });

geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { showError('Geolocation not supported.'); return; }
  geoBtn.style.transform = 'scale(0.9)';
  setTimeout(() => geoBtn.style.transform = '', 200);
  searchedDisplayName = null;
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
    ()  => showError('Location access denied.')
  );
});

shareBtn.addEventListener('click', shareWeather);

btnC.addEventListener('click', () => {
  if (currentUnit === 'C') return;
  currentUnit = 'C'; localStorage.setItem(UNIT_KEY, 'C');
  btnC.classList.add('active'); btnF.classList.remove('active');
  refreshTemps();
});
btnF.addEventListener('click', () => {
  if (currentUnit === 'F') return;
  currentUnit = 'F'; localStorage.setItem(UNIT_KEY, 'F');
  btnF.classList.add('active'); btnC.classList.remove('active');
  refreshTemps();
});

errorClose.addEventListener('click', hideError);

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
initApp();
