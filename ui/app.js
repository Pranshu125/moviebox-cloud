/* =========================================================================
   MovieBox Studio UI — Native MovieBox + 4KHDHub + Local 4K + VLC Controller
   ========================================================================= */

const FALLBACK_STREAMS = {
  tearsOfSteel4K: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  sintel1080p: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
};

const INITIAL_HEROES = [
  {
    id: 'local_spiderman',
    title: 'Spider-Man: Brand New Day',
    ribbon: 'LOCAL 4K VAULT',
    match: '99% Match',
    year: '2026',
    maturity: 'U/A 13+',
    quality: '4K UHD (2160p)',
    atmosLabel: 'DOLBY ATMOS',
    rating: '9.1',
    type: 'movie',
    isLocal: true,
    provider: 'Local Home Theater (27.80 GB MKV)',
    genres: ['Action', 'Sci-Fi', 'Adventure'],
    languages: 'Multi-Audio (English, Hindi, Tamil, Telugu) • DDP 5.1 Atmos',
    poster: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=800&q=85',
    backdrop: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=1920&q=85',
    description: 'Peter Parker faces a new chapter in New York City while balancing his double life. Stored locally in 2160p 4K UHD with Dolby Atmos 5.1 multi-language audio.'
  },
  {
    id: 'mb_8449792878959887920',
    subjectId: '8449792878959887920',
    title: 'Loki [Hindi]',
    cleanTitle: 'Loki',
    ribbon: 'FEATURED SERIES',
    match: '98% Match',
    year: '2021',
    maturity: 'U/A 16+',
    quality: '1080p Full HD',
    atmosLabel: 'HEVC • MULTI-AUDIO',
    rating: '8.2',
    type: 'series',
    stype: 2,
    season: 1,
    episode: 1,
    progressSeconds: 1540,
    provider: 'MovieBox CDN • S01E01',
    genres: ['Action', 'Adventure', 'Fantasy'],
    languages: 'Multi-Audio (Hindi, English, Tamil, Telugu)',
    poster: 'https://pbcdn.aoneroom.com/image/2026/09/06/82cded1cbee4b418637ce9b0f34e3252.jpg',
    backdrop: 'https://pbcdn.aoneroom.com/image/2026/09/06/82cded1cbee4b418637ce9b0f34e3252.jpg',
    description: 'The mercurial villain Loki resumes his role as the God of Mischief in a series that takes place after the events of Avengers: Endgame.'
  }
];

// Global App State
const state = {
  system: {},
  localMedia: [],
  tuiConfig: {},
  tuiHistory: { watched: [], recent: [] },
  uiData: {
    watchlist: [],
    likes: [],
    ambientMode: true,
    customIptv: []
  },
  heroes: [...INITIAL_HEROES],
  activeHeroIndex: 0,
  heroTimer: null,
  top10Movies: [],
  top10Series: [],
  moviesCatalog: [],
  seriesCatalog: [],
  animeCatalog: [],
  mbRows: [],
  currentItem: null,
  currentStreams: [],
  currentQualityOptions: [],
  currentSubtitles: [],
  currentDubs: [],
  activeStream: null,
  activeAudioType: 'aac_stereo',
  hlsInstance: null,
  dashInstance: null,
  ambientFrameId: null,
  audioCtx: null,
  audioSourceNode: null,
  audioGainNode: null,
  audioBiquadLow: null,
  audioBiquadHigh: null,
  gaiaflixCatalog: {
    counts: { live: 0, upcoming: 0, channels: 0 },
    liveEvents: [],
    upcomingEvents: [],
    channels: []
  }
};

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3600);
}

function formatSeconds(sec) {
  if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function cleanEmoji(text) {
  return String(text || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
}

// =========================================================================
// DEVICE DETECTION & ADAPTIVE RESPONSIVE LAYOUT ENGINE
// Automatically adapts UI according to the device being used:
// - Phone (touch gestures, bottom dock, full-width touch friendly player)
// - Tablet (adaptive 3-4 column grid, flexible layout)
// - Desktop (expanded studio sidebar, keyboard shortcuts, precision controls)
// - Smart TV (D-pad focus states, 10-foot cinema UI)
// =========================================================================
function detectDeviceProfile() {
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|iPhone|iPod|Windows Phone|webOS|BlackBerry/i.test(ua);
  const isTabletUA = /iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua) && window.innerWidth <= 1180);
  const isTvUA = /SmartTV|GoogleTV|HbbTV|AppleTV|BRAVIA|NetCast|Tizen|Web0S|Roku|POV_TV/i.test(ua);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  const isLandscape = w > h;

  let device = 'desktop';
  if (isTvUA) {
    device = 'tv';
  } else if (isTabletUA || (isTouch && w >= 768 && w <= 1180)) {
    device = 'tablet';
  } else if (isMobileUA || w < 768 || (isTouch && w < 850 && !isLandscape)) {
    device = 'mobile';
  }

  const root = document.documentElement;
  const body = document.body;

  root.dataset.device = device;
  root.dataset.orientation = isLandscape ? 'landscape' : 'portrait';
  root.dataset.touch = isTouch ? 'touch' : 'mouse';

  body.classList.remove('device-mobile', 'device-tablet', 'device-desktop', 'device-tv', 'orientation-landscape', 'orientation-portrait');
  body.classList.add(`device-${device}`);
  body.classList.add(isLandscape ? 'orientation-landscape' : 'orientation-portrait');

  if (state) {
    state.deviceProfile = { device, isTouch, isLandscape, width: w, height: h };
  }

  // Adjust billboard height according to device
  const heroEl = document.getElementById('heroBillboard');
  if (heroEl) {
    if (device === 'mobile') {
      heroEl.style.minHeight = isLandscape ? '280px' : '440px';
    } else if (device === 'tablet') {
      heroEl.style.minHeight = '480px';
    } else {
      heroEl.style.minHeight = '';
    }
  }

  return device;
}

// =========================================================================
// 1. INITIALIZATION & NATIVE MOVIEBOX SYNC
// =========================================================================
async function initApp() {
  detectDeviceProfile();
  window.addEventListener('resize', () => {
    clearTimeout(window._resizeTimer);
    window._resizeTimer = setTimeout(detectDeviceProfile, 100);
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(detectDeviceProfile, 150);
  });

  bindEvents();
  await loadBackendState();
  renderHeroSwitcher();
  setActiveHero(0);
  startHeroAutoRotate();

  renderLocalMediaRail();
  renderContinueWatchingRail();
  renderLiveTvRail();

  // Fetch 100% Real Live MovieBox Homepage Catalog
  await fetchMovieBoxHome();

  // Fetch real-time 24/7 channels and live sports feed
  fetchGaiaFlixCatalog();
}

async function loadBackendState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    if (data.ok) {
      state.system = data.system || {};
      state.localMedia = data.localMedia || [];
      state.tuiConfig = data.tuiConfig || {};
      state.tuiHistory = data.tuiHistory || { watched: [], recent: [] };
      state.uiData = { ...state.uiData, ...(data.uiData || {}) };

      if (state.localMedia.length > 0) {
        const localFirst = state.localMedia[0];
        state.heroes[0] = {
          ...state.heroes[0],
          ...localFirst,
          ribbon: `LOCAL 4K VAULT • ${localFirst.sizeFormatted}`,
          atmosLabel: 'DOLBY ATMOS',
          match: '99% Match'
        };
        const hubSub = document.getElementById('hubLocalCount');
        if (hubSub) {
          hubSub.textContent = `${state.localMedia.length} File(s) • ${localFirst.sizeFormatted}`;
        }
      }

      const vlcInput = document.getElementById('settingVlcPath');
      const dirInput = document.getElementById('settingTheaterDir');
      const ambCheck = document.getElementById('settingAmbientToggle');
      if (vlcInput) vlcInput.value = state.system.vlcPath || 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
      if (dirInput) dirInput.value = state.system.homeTheaterDir || 'D:\\Home Theater';
      if (ambCheck) ambCheck.checked = state.uiData.ambientMode !== false;
    }
  } catch (err) {
    console.warn('Could not load backend state:', err);
  }
}

async function fetchMovieBoxHome() {
  try {
    const res = await fetch('/api/moviebox/home');
    const data = await res.json();
    if (data.ok) {
      if (Array.isArray(data.banners) && data.banners.length > 0) {
        state.heroes = [
          state.heroes[0],
          state.heroes[1],
          ...data.banners.slice(0, 4)
        ];
        renderHeroSwitcher();
        setActiveHero(state.activeHeroIndex);
      }

      state.top10Movies = data.top10Movies || [];
      state.top10Series = data.top10Series || [];
      state.mbRows = data.rows || [];

      const movieRows = state.mbRows.filter(r => r.category === 'movies');
      const seriesRows = state.mbRows.filter(r => r.category === 'series');
      const animeRow = state.mbRows.find(r => r.title.toLowerCase().includes('anime'));
      const westernRow = state.mbRows.find(r => /western|hollywood|english|global/i.test(r.title));

      state.moviesCatalog = movieRows[0]?.items || state.top10Movies;
      state.seriesCatalog = seriesRows[0]?.items || state.top10Series;
      state.animeCatalog = animeRow?.items || [];
      const bollyRow = state.mbRows.find(r => /bollywood|hindi|dual/i.test(r.title));
      state.bollywoodCatalog = (bollyRow?.items || westernRow?.items || [...state.top10Series.slice(0, 6), ...state.top10Movies.slice(0, 6)]).map(item => ({
        ...item,
        provider: item.provider || 'HDHub4u • Vegamovies',
        quality: item.quality || '1080p Dual Audio'
      }));
      state.netMirrorCatalog = state.bollywoodCatalog;

      renderTop10Rail();
      renderPosterRail('bollywoodRail', state.bollywoodCatalog);
      renderPosterRail('trendingMoviesRail', state.moviesCatalog);
      renderPosterRail('trendingSeriesRail', state.seriesCatalog);
      renderPosterRail('animeRail', state.animeCatalog);
      renderAllDynamicMovieBoxRows(state.mbRows);

      // Fetch dedicated Indian/Bollywood catalog asynchronously
      fetchBollywoodCatalog().catch(() => {});
    }
  } catch (err) {
    console.warn('Failed fetching MovieBox home:', err);
  }
}

async function fetchBollywoodCatalog(force = false) {
  try {
    const res = await fetch(`/api/netmirror/catalog${force ? '?refresh=1' : ''}`);
    const data = await res.json();
    if (data.ok && Array.isArray(data.items) && data.items.length > 0) {
      state.bollywoodCatalog = data.items.map(it => ({
        ...it,
        provider: (it.provider && !/netmirror/i.test(it.provider)) ? it.provider : 'HDHub4u / Vegamovies 4K'
      }));
      state.netMirrorCatalog = state.bollywoodCatalog;
      renderPosterRail('bollywoodRail', state.bollywoodCatalog);
      if (state.activeDedicatedPage === 'bollywood' || state.activeDedicatedPage === 'netmirror') {
        renderDedicatedPageContent('bollywood');
      }
    }
  } catch (err) {
    console.warn('Could not fetch Bollywood catalog:', err);
  }
}
const fetchNetMirrorCatalog = fetchBollywoodCatalog;

// =========================================================================
// 2. HERO BILLBOARD
// =========================================================================
function renderHeroSwitcher() {
  const tray = document.getElementById('heroSwitcherTray');
  if (!tray) return;
  tray.innerHTML = '';

  state.heroes.forEach((h, idx) => {
    const btn = document.createElement('button');
    btn.className = `hero-thumb-btn ${idx === state.activeHeroIndex ? 'active' : ''}`;
    btn.title = h.cleanTitle || h.title;
    btn.innerHTML = `<img src="${h.backdrop || h.poster}" alt="${h.title}" loading="lazy" />`;
    btn.addEventListener('click', () => {
      setActiveHero(idx);
      startHeroAutoRotate();
    });
    tray.appendChild(btn);
  });
}

function setActiveHero(index) {
  state.activeHeroIndex = index;
  const hero = state.heroes[index];
  if (!hero) return;

  const img = document.getElementById('heroBackdropImg');
  if (img) img.src = hero.backdrop || hero.poster;

  document.getElementById('heroRibbonText').textContent = hero.ribbon || (hero.type === 'series' ? 'FEATURED SERIES' : 'PREMIERE');
  document.getElementById('heroTitle').textContent = hero.cleanTitle || hero.title;
  document.getElementById('heroMatch').textContent = hero.match || '98% Match';
  document.getElementById('heroYear').textContent = hero.year || '2026';
  document.getElementById('heroMaturity').textContent = hero.maturity || 'U/A 13+';
  document.getElementById('heroQuality').textContent = hero.quality || '1080p Full HD';

  const atmosEl = document.getElementById('heroAtmosBadge');
  if (atmosEl) {
    if (hero.isLocal) {
      atmosEl.textContent = 'DOLBY ATMOS';
    } else if ((hero.dubs && hero.dubs.length > 1) || /multi/i.test(hero.languages || '')) {
      atmosEl.textContent = 'HEVC • MULTI-AUDIO';
    } else {
      atmosEl.textContent = 'HEVC • AAC 2.0';
    }
  }

  document.getElementById('heroRating').textContent = hero.rating || '8.4';
  document.getElementById('heroLanguages').textContent = hero.languages || 'Original Stereo & Multi-Audio Support';
  document.getElementById('heroSynopsis').textContent = hero.description || '';

  const inList = (state.uiData.watchlist || []).includes(hero.id);
  const listIcon = document.getElementById('heroAddListIcon');
  if (listIcon) listIcon.textContent = inList ? 'In Watchlist' : 'Watchlist';

  document.querySelectorAll('.hero-thumb-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === index);
  });
}

function startHeroAutoRotate() {
  if (state.heroTimer) clearInterval(state.heroTimer);
  state.heroTimer = setInterval(() => {
    const next = (state.activeHeroIndex + 1) % state.heroes.length;
    setActiveHero(next);
  }, 10000);
}

// =========================================================================
// 3. CONTENT RAILS (LOCAL 4K, CONTINUE WATCHING, TOP 10 & MOVIEBOX ROWS)
// =========================================================================
function renderLocalMediaRail() {
  const rail = document.getElementById('localMediaRail');
  if (!rail) return;
  rail.innerHTML = '';

  const items = state.localMedia.length > 0 ? state.localMedia : [state.heroes[0]];

  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'wide-card';
    card.innerHTML = `
      <div class="wide-thumb">
        <img src="${item.backdrop || item.poster}" alt="${item.title}" loading="lazy" />
        <div class="card-badges-top">
          <span class="pill-badge gold">${item.quality || '4K UHD'} • ${item.sizeFormatted || '27.8 GB'}</span>
          <span class="pill-badge atmos">DOLBY ATMOS</span>
        </div>
        <div class="thumb-play-overlay">
          <div class="play-circle-icon">▶</div>
        </div>
      </div>
      <div class="wide-body">
        <div class="wide-title" title="${item.rawFilename || item.title}">${item.title} (${item.year})</div>
        <div class="wide-meta">
          <span>${item.ext || 'MKV'}</span>
          <span>•</span>
          <span>DDP 5.1 Multi-Audio</span>
          <span>•</span>
          <span>IMDb ${item.rating || '9.1'}</span>
        </div>
        <div class="wide-actions">
          <button class="card-btn play" data-action="play">Play</button>
          <button class="card-btn vlc" data-action="vlc">Open in VLC</button>
          <button class="card-btn ghost" data-action="info" title="Details">Info</button>
        </div>
      </div>
    `;

    card.querySelector('.wide-thumb').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="play"]').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="vlc"]').addEventListener('click', () => launchInVlc(item));
    card.querySelector('[data-action="info"]').addEventListener('click', () => openDetailsModal(item));
    rail.appendChild(card);
  });
}

function renderContinueWatchingRail() {
  const rail = document.getElementById('continueWatchingRail');
  if (!rail) return;
  rail.innerHTML = '';

  const recentTui = (state.tuiHistory && state.tuiHistory.recent) || [];
  const combined = [];

  recentTui.forEach(r => {
    const subjId = String(r.subject_id || '');
    const isSeries = Number(r.stype) === 2;
    const se = Number(r.season || (isSeries ? 1 : 0));
    const ep = Number(r.episode || (isSeries ? 1 : 0));
    const progress = Number(r.progress_seconds || 0);
    const duration = Number(r.duration_seconds || 3600);
    const pct = progress > 0 ? Math.min(95, Math.max(10, Math.round((progress / duration) * 100))) : 15;
    const cleanQual = String(r.stream_filename || '1080p Full HD').toUpperCase().includes('1080') ? '1080p Full HD' : 'HD';

    combined.push({
      id: `mb_${subjId}`,
      subjectId: subjId,
      provider: 'MovieBox CDN',
      providerKind: 'moviebox',
      title: r.title,
      cleanTitle: String(r.title || '').replace(/\s*\[[^\]]+\]\s*/g, '').trim() || r.title,
      year: r.release_year || '2026',
      type: isSeries ? 'series' : 'movie',
      stype: r.stype || 1,
      season: se,
      episode: ep,
      poster: r.cover_url || '',
      backdrop: r.cover_url || '',
      quality: cleanQual,
      progressSeconds: progress,
      durationSeconds: duration,
      progressPct: pct,
      episodeTag: isSeries ? `S${String(se).padStart(2, '0')}E${String(ep).padStart(2, '0')}` : 'Movie',
      description: `Continue watching ${r.title}${isSeries ? ` (Season ${se}, Episode ${ep})` : ''} from ${formatSeconds(progress)}.`
    });
  });

  if (state.localMedia.length > 0) {
    const loc = state.localMedia[0];
    combined.unshift({
      ...loc,
      progressSeconds: 0,
      progressPct: 18,
      episodeTag: 'Local 4K'
    });
  }

  combined.forEach(item => {
    const card = document.createElement('article');
    card.className = 'wide-card';
    card.innerHTML = `
      <div class="wide-thumb">
        <img src="${item.backdrop || item.poster}" alt="${item.title}" loading="lazy" />
        <div class="card-badges-top">
          <span class="pill-badge dark">${item.episodeTag} • ${item.quality}</span>
          <span class="pill-badge atmos">${item.progressSeconds > 0 ? 'Resume ' + formatSeconds(item.progressSeconds) : 'Ready'}</span>
        </div>
        <div class="thumb-play-overlay">
          <div class="play-circle-icon">▶</div>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width: ${item.progressPct || 20}%"></div>
        </div>
      </div>
      <div class="wide-body">
        <div class="wide-title">${item.title}</div>
        <div class="wide-meta">
          <span>${item.year}</span>
          <span>•</span>
          <span>${item.provider}</span>
        </div>
        <div class="wide-actions">
          <button class="card-btn play" data-action="play">Play</button>
          <button class="card-btn vlc" data-action="vlc">Open in VLC</button>
          <button class="card-btn ghost" data-action="info">Info</button>
        </div>
      </div>
    `;

    card.querySelector('.wide-thumb').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="play"]').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="vlc"]').addEventListener('click', () => launchInVlc(item, item.progressSeconds));
    card.querySelector('[data-action="info"]').addEventListener('click', () => openDetailsModal(item));
    rail.appendChild(card);
  });
}

function renderTop10Rail() {
  const rail = document.getElementById('top10Rail');
  if (!rail) return;
  rail.innerHTML = '';

  const sourceList = state.top10Movies.length > 0 ? state.top10Movies.slice(0, 10) : state.heroes.slice(0, 10);

  sourceList.forEach((item, index) => {
    const rank = index + 1;
    const wrap = document.createElement('div');
    wrap.className = 'top10-item';
    wrap.innerHTML = `
      <svg class="top10-rank-svg" viewBox="0 0 110 180">
        <text
          x="5"
          y="152"
          font-family="Outfit, sans-serif"
          font-weight="900"
          font-size="155"
          fill="rgba(255, 255, 255, 0.04)"
          stroke="rgba(255, 255, 255, 0.28)"
          stroke-width="3"
        >${rank}</text>
      </svg>
      <article class="poster-card">
        <div class="poster-thumb">
          <img src="${item.poster || item.backdrop}" alt="${item.title}" loading="lazy" />
          <div class="card-badges-top">
            <span class="pill-badge gold">${item.quality || '1080p Full HD'}</span>
          </div>
          <div class="thumb-play-overlay">
            <div class="play-circle-icon">▶</div>
          </div>
        </div>
        <div class="poster-body">
          <div class="poster-title" title="${item.title}">${item.cleanTitle || item.title}</div>
          <div class="poster-sub">
            <span>${item.year || '2026'}</span>
            <span>IMDb ${item.rating || '8.4'}</span>
          </div>
          <div class="wide-actions">
            <button class="card-btn play" data-action="play">Play</button>
            <button class="card-btn vlc" data-action="vlc" title="Open in VLC">VLC</button>
            <button class="card-btn dl" data-action="dl" title="Download Options">Save</button>
            <button class="card-btn ghost" data-action="info" title="Details &amp; Audio">Info</button>
          </div>
        </div>
      </article>
    `;

    wrap.querySelector('.poster-thumb').addEventListener('click', () => openTheaterPlayer(item));
    wrap.querySelector('[data-action="play"]').addEventListener('click', () => openTheaterPlayer(item));
    wrap.querySelector('[data-action="vlc"]').addEventListener('click', () => launchInVlc(item));
    wrap.querySelector('[data-action="dl"]').addEventListener('click', () => startDownload(item));
    wrap.querySelector('[data-action="info"]').addEventListener('click', () => openDetailsModal(item));
    rail.appendChild(wrap);
  });
}

function renderPosterRail(containerId, items) {
  const rail = document.getElementById(containerId);
  if (!rail) return;
  rail.innerHTML = '';

  items.forEach(item => {
    const card = buildPosterCard(item);
    rail.appendChild(card);
  });
}

function buildPosterCard(item) {
  const card = document.createElement('article');
  card.className = 'poster-card';
  card.tabIndex = 0;
  const audioTag = (item.badges && item.badges[1]) ? item.badges[1] : (item.type === 'series' ? 'Series' : 'Movie');
  card.innerHTML = `
    <div class="poster-thumb">
      <img src="${item.poster || item.backdrop}" alt="${item.title}" loading="lazy" />
      <div class="card-badges-top">
        <span class="pill-badge gold">${item.quality || '1080p Full HD'}</span>
        <span class="pill-badge dark">IMDb ${item.rating || '8.2'}</span>
      </div>
      <div class="thumb-play-overlay">
        <div class="play-circle-icon">▶</div>
      </div>
    </div>
    <div class="poster-body">
      <div class="poster-title" title="${item.title}">${item.cleanTitle || item.title}</div>
      <div class="poster-sub">
        <span>${item.year || '2026'}</span>
        <span>${audioTag}</span>
      </div>
      <div class="wide-actions">
        <button class="card-btn play" data-action="play">Play</button>
        <button class="card-btn vlc" data-action="vlc" title="Play in VLC">VLC</button>
        <button class="card-btn dl" data-action="dl" title="Download Options">Save</button>
        <button class="card-btn ghost" data-action="info" title="Details &amp; Audio">Info</button>
      </div>
    </div>
  `;

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === card) {
      e.preventDefault();
      openTheaterPlayer(item);
    }
  });
  card.querySelector('.poster-thumb').addEventListener('click', () => openTheaterPlayer(item));
  card.querySelector('[data-action="play"]').addEventListener('click', () => openTheaterPlayer(item));
  card.querySelector('[data-action="vlc"]').addEventListener('click', () => launchInVlc(item));
  card.querySelector('[data-action="dl"]').addEventListener('click', () => startDownload(item));
  card.querySelector('[data-action="info"]').addEventListener('click', () => openDetailsModal(item));
  return card;
}

function renderAllDynamicMovieBoxRows(rows) {
  const container = document.getElementById('dynamicMovieBoxRows');
  if (!container) return;
  container.innerHTML = '';

  rows.forEach((row) => {
    if (!row.items || row.items.length === 0) return;
    const section = document.createElement('section');
    section.className = 'media-row-section';
    section.innerHTML = `
      <div class="row-header">
        <div>
          <h2 class="row-title">${cleanEmoji(row.title)}</h2>
        </div>
      </div>
      <div class="media-rail poster-cards"></div>
    `;
    const rail = section.querySelector('.media-rail');
    row.items.forEach(item => {
      rail.appendChild(buildPosterCard(item));
    });
    container.appendChild(section);
  });
}

function renderLiveTvRail() {
  const rail = document.getElementById('liveTvRail');
  const sideList = document.getElementById('sidebarLiveTvList');
  if (!rail) return;
  rail.innerHTML = '';
  if (sideList) sideList.innerHTML = '';

  const channels = state.uiData.customIptv || [];
  channels.forEach(ch => {
    const item = {
      id: ch.id,
      title: ch.name,
      year: 'LIVE NOW',
      rating: 'LIVE',
      quality: ch.quality || '1080p60 LIVE',
      provider: `IPTV • ${ch.category}`,
      poster: ch.logo,
      backdrop: ch.logo,
      streamUrl: ch.streamUrl,
      isLive: true,
      description: `Live 24/7 broadcast (${ch.category} • ${ch.language}).`
    };

    const card = document.createElement('article');
    card.className = 'wide-card';
    card.innerHTML = `
      <div class="wide-thumb">
        <img src="${ch.logo}" alt="${ch.name}" loading="lazy" />
        <div class="card-badges-top">
          <span class="pill-badge live">LIVE</span>
          <span class="pill-badge dark">${ch.category}</span>
        </div>
        <div class="thumb-play-overlay">
          <div class="play-circle-icon">▶</div>
        </div>
      </div>
      <div class="wide-body">
        <div class="wide-title">${ch.name}</div>
        <div class="wide-meta">
          <span>${ch.quality}</span>
          <span>•</span>
          <span>${ch.language}</span>
        </div>
        <div class="wide-actions">
          <button class="card-btn play" data-action="play">Watch</button>
          <button class="card-btn vlc" data-action="vlc">VLC</button>
        </div>
      </div>
    `;

    card.querySelector('.wide-thumb').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="play"]').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="vlc"]').addEventListener('click', () => launchInVlc(item));
    rail.appendChild(card);

    if (sideList) {
      const uCard = document.createElement('div');
      uCard.className = 'upnext-card';
      uCard.innerHTML = `
        <img src="${ch.logo}" alt="${ch.name}" />
        <div class="upnext-info">
          <div class="upnext-title">${ch.name}</div>
          <div class="upnext-meta">${ch.category} • ${ch.quality}</div>
        </div>
      `;
      uCard.addEventListener('click', () => openTheaterPlayer(item));
      sideList.appendChild(uCard);
    }
  });
}

function renderGaiaFlixRail() {
  const rail = document.getElementById('liveSportsRail') || document.getElementById('gaiaFlixRail');
  if (!rail) return;
  rail.innerHTML = '';

  const live = state.gaiaflixCatalog?.liveEvents || [];
  const channels = state.gaiaflixCatalog?.channels || [];
  const upcoming = state.gaiaflixCatalog?.upcomingEvents || [];

  const showcase = [
    ...live,
    ...channels.slice(0, 16),
    ...upcoming.slice(0, 4)
  ];

  if (showcase.length === 0) {
    rail.innerHTML = `
      <div class="dedicated-empty-box" style="padding: 24px; width: 100%;">
        <strong>Connecting to Live Feeds...</strong>
        <p>Fetching 300+ live sports matches and broadcast channels.</p>
      </div>
    `;
    return;
  }

  showcase.forEach(item => {
    const card = document.createElement('article');
    card.className = 'wide-card';
    card.tabIndex = 0;
    const isLiveMatch = item.badge === 'LIVE MATCH';
    const isUpcoming = item.badge === 'UPCOMING FEED';
    const badgeClass = isLiveMatch ? 'live' : (isUpcoming ? 'upcoming' : 'live');
    const badgeText = item.badge || '24/7 LIVE';

    card.innerHTML = `
      <div class="wide-thumb">
        <img src="${item.poster || item.backdrop}" alt="${item.cleanTitle || item.title}" loading="lazy" />
        <div class="card-badges-top">
          <span class="pill-badge ${badgeClass}">${badgeText}</span>
          <span class="pill-badge dark">${item.category}</span>
        </div>
        <div class="thumb-play-overlay">
          <div class="play-circle-icon">▶</div>
        </div>
      </div>
      <div class="wide-body">
        <div class="wide-title" title="${item.cleanTitle || item.title}">${item.cleanTitle || item.title}</div>
        <div class="wide-meta">
          <span>${item.quality || '1080p60'}</span>
          <span>•</span>
          <span>${(item.provider && !/gaia/i.test(item.provider)) ? item.provider : 'Live Sports HD'}</span>
        </div>
        <div class="wide-actions">
          <button class="card-btn play" data-action="play">${isUpcoming ? 'Watch Feed' : 'Watch'}</button>
          <button class="card-btn vlc" data-action="vlc">VLC</button>
        </div>
      </div>
    `;

    card.querySelector('.wide-thumb').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="play"]').addEventListener('click', () => openTheaterPlayer(item));
    card.querySelector('[data-action="vlc"]').addEventListener('click', () => launchInVlc(item));
    rail.appendChild(card);
  });
}

async function fetchGaiaFlixCatalog(forceRefresh = false) {
  try {
    const res = await fetch(`/api/gaiaflix/catalog${forceRefresh ? '?refresh=1' : ''}`);
    const data = await res.json();
    if (data.ok) {
      state.gaiaflixCatalog = {
        counts: data.counts || { live: 0, upcoming: 0, channels: 0 },
        liveEvents: data.liveEvents || [],
        upcomingEvents: data.upcomingEvents || [],
        channels: data.channels || []
      };

      const hubCount = document.getElementById('hubLiveCount') || document.getElementById('hubGaiaflixCount');
      if (hubCount) {
        const liveCount = data.counts?.live || 0;
        const chCount = data.counts?.channels || 0;
        hubCount.textContent = liveCount > 0
          ? `${liveCount} Live Matches • ${chCount} Channels`
          : `${chCount} Channels & Live Feeds`;
      }

      renderGaiaFlixRail();

      const dedicatedView = document.getElementById('dedicatedPageView');
      if (dedicatedView && !dedicatedView.classList.contains('hidden') && (state.activeDedicatedPage === 'gaiaflix' || state.activeDedicatedPage === 'livetv')) {
        renderDedicatedPageContent(state.activeDedicatedPage);
      }

      if (forceRefresh) {
        showToast(`Live feeds updated: ${data.counts?.live || 0} live events, ${data.counts?.channels || 0} channels`);
      }
    }
  } catch (err) {
    console.warn('Could not fetch live sports catalog:', err);
  }
}
const fetchLiveCatalog = fetchGaiaFlixCatalog;
}

// =========================================================================
// 4. THEATER PLAYER + VLC 5-BAND EQ + 200% GAIN BOOST + VIDEO FILTERS
// =========================================================================
const EQ_FREQS = [60, 230, 910, 3600, 14000];
const EQ_PRESETS = {
  flat:   { preamp: 0, bands: [0, 0, 0, 0, 0] },
  cinema: { preamp: 2, bands: [6, 3, -1, 3, 5] },
  bass:   { preamp: 2, bands: [8, 5, 0, 1, 2] },
  vocal:  { preamp: 3, bands: [-3, -1, 5, 6, 2] },
  night:  { preamp: 4, bands: [-4, 1, 4, 3, -2] }
};

state.volumeBoost = 1.0;
state.eqPreampDb = 0;
state.eqBandsDb = [0, 0, 0, 0, 0];
state.eqNodes = [];
state.vfx = { brightness: 100, contrast: 100, saturation: 100, hue: 0, aspect: 'fit' };
state.abLoop = { a: null, b: null };

function ensureWebAudioGraph() {
  const video = document.getElementById('mainVideo');
  if (!video) return false;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    if (!state.audioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // Crucial: Never hijack <video> with createMediaElementSource unless AudioContext is running or unlocked
      state.audioCtx = ctx;
    }

    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(() => {});
    }

    if (!state.audioSourceNode && state.audioCtx.state === 'running') {
      state.audioSourceNode = state.audioCtx.createMediaElementSource(video);
      state.eqNodes = EQ_FREQS.map((freq, idx) => {
        const f = state.audioCtx.createBiquadFilter();
        f.type = idx === 0 ? 'lowshelf' : (idx === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking');
        f.frequency.value = freq;
        f.Q.value = 1.1;
        f.gain.value = state.eqBandsDb[idx] || 0;
        return f;
      });
      state.audioGainNode = state.audioCtx.createGain();

      let prev = state.audioSourceNode;
      state.eqNodes.forEach(node => {
        prev.connect(node);
        prev = node;
      });
      prev.connect(state.audioGainNode);
      state.audioGainNode.connect(state.audioCtx.destination);
    }

    if (state.audioGainNode) {
      const preampLinear = Math.pow(10, (state.eqPreampDb || 0) / 20);
      const boostFactor = Math.max(0, state.volumeBoost || 1.0);
      state.audioGainNode.gain.value = preampLinear * boostFactor;
    }
    if (state.eqNodes && state.eqNodes.length === 5) {
      state.eqNodes.forEach((node, idx) => {
        node.gain.value = Number(state.eqBandsDb[idx] || 0);
      });
    }
    return Boolean(state.audioSourceNode);
  } catch {
    return false;
  }
}

function setPlayerVolumeAndBoost(sliderVal, fromUserGesture = false) {
  const video = document.getElementById('mainVideo');
  const volSlider = document.getElementById('volumeSlider');
  const pctLabel = document.getElementById('volumePctLabel');
  const muteBtn = document.getElementById('muteBtn');
  if (!video) return;

  const val = Math.max(0, Math.min(2, Number(sliderVal)));
  if (volSlider && Number(volSlider.value) !== val) {
    volSlider.value = String(val);
  }

  video.muted = val === 0;
  // Native HTML5 video volume handles 0.0 to 1.0; WebAudio Gain handles 1.0 to 2.0 (up to 200% VLC boost)
  video.volume = Math.min(1, val);
  state.volumeBoost = val > 1 ? val : 1.0;

  if (fromUserGesture && (val > 1 || state.audioSourceNode)) {
    ensureWebAudioGraph();
  } else if (state.audioGainNode) {
    const preampLinear = Math.pow(10, (state.eqPreampDb || 0) / 20);
    state.audioGainNode.gain.value = preampLinear * state.volumeBoost;
  }

  const pct = Math.round(val * 100);
  if (pctLabel) {
    pctLabel.textContent = `${pct}%`;
    pctLabel.classList.toggle('boosted', pct > 100);
  }
  if (muteBtn) {
    muteBtn.textContent = video.muted ? 'Muted' : 'Vol';
  }
}

function applyEqPreset(presetKey, fromUserGesture = false) {
  const preset = EQ_PRESETS[presetKey] || EQ_PRESETS.flat;
  state.eqPreampDb = preset.preamp;
  state.eqBandsDb = [...preset.bands];

  const preampEl = document.getElementById('eqPreamp');
  const preampValEl = document.getElementById('eqPreampVal');
  if (preampEl) preampEl.value = String(state.eqPreampDb);
  if (preampValEl) preampValEl.textContent = `${state.eqPreampDb >= 0 ? '+' : ''}${state.eqPreampDb}dB`;

  document.querySelectorAll('.eq-band-slider').forEach(slider => {
    const idx = Number(slider.dataset.band || 0);
    const db = state.eqBandsDb[idx] || 0;
    slider.value = String(db);
    const valSpan = slider.parentElement?.querySelector('.eq-val');
    if (valSpan) valSpan.textContent = `${db >= 0 ? '+' : ''}${db}dB`;
  });

  document.querySelectorAll('#eqPresetsRow .eq-preset-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.eqpreset === presetKey);
  });

  if (fromUserGesture) {
    ensureWebAudioGraph();
  }
}

function applyWebAudioProfile(mode, fromUserGesture = false) {
  state.activeAudioType = mode || 'aac_stereo';

  document.querySelectorAll('#watchAudioFormatPills .dub-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.audiotype === state.activeAudioType);
  });

  const video = document.getElementById('mainVideo');
  if (video && video.muted && Number(document.getElementById('volumeSlider')?.value || 1) > 0) {
    video.muted = false;
  }

  if (state.activeAudioType === 'ddp_surround') {
    applyEqPreset('cinema', fromUserGesture);
  } else if (state.activeAudioType === 'vocal_clarity') {
    applyEqPreset('vocal', fromUserGesture);
  } else {
    applyEqPreset('flat', fromUserGesture);
  }

  updateWatchBadgesAndAudioSummary();
}

function updateVideoFilterStyles() {
  const video = document.getElementById('mainVideo');
  if (!video) return;
  const { brightness, contrast, saturation, hue, aspect } = state.vfx;
  video.style.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`;
  video.classList.remove('aspect-fit', 'aspect-16-9', 'aspect-21-9', 'aspect-fill', 'aspect-4-3');
  const mapClass = {
    'fit': 'aspect-fit',
    '16:9': 'aspect-16-9',
    '21:9': 'aspect-21-9',
    'fill': 'aspect-fill',
    '4:3': 'aspect-4-3'
  };
  video.classList.add(mapClass[aspect] || 'aspect-fit');
}

function updateStatsForNerds() {
  const overlay = document.getElementById('statsForNerdsOverlay');
  const video = document.getElementById('mainVideo');
  if (!overlay || overlay.classList.contains('hidden') || !video) return;

  const quality = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : {};
  const dropped = quality.droppedVideoFrames || 0;
  const totalFrames = quality.totalVideoFrames || 0;
  const vw = video.videoWidth || 1920;
  const vh = video.videoHeight || 1080;

  let bufSec = 0;
  if (video.buffered && video.buffered.length > 0) {
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
        bufSec = Math.max(0, video.buffered.end(i) - video.currentTime);
        break;
      }
    }
  }

  const pct = Math.round((Number(document.getElementById('volumeSlider')?.value || 1)) * 100);
  document.getElementById('sfnViewport').textContent = `${vw}x${vh} • ${dropped}/${totalFrames} dropped`;
  document.getElementById('sfnResolution').textContent = `${state.activeStream?.quality || '1080p Full HD'} • ${state.activeStream?.codec || 'HEVC'}`;
  document.getElementById('sfnAudio').textContent = `${getAudioTypeLabel(state.activeAudioType)} (${pct}% Vol)`;
  document.getElementById('sfnBuffer').textContent = `${bufSec.toFixed(1)} s buffered`;
  document.getElementById('sfnProtocol').textContent = state.dashInstance ? 'MPEG-DASH (Proxy MPD)' : (state.hlsInstance ? 'HLS (M3U8)' : 'Direct HTTP Range');
}

function getAudioTypeLabel(mode) {
  if (mode === 'ddp_surround') return 'Dolby Surround 5.1';
  if (mode === 'vocal_clarity') return 'Dialogue Clarity';
  return 'AAC 2.0 Stereo';
}

function updateWatchBadgesAndAudioSummary() {
  const badgesRow = document.getElementById('watchBadgesRow');
  const audioInfoEl = document.getElementById('watchAudioInfo');
  const item = state.currentItem;
  if (!item) return;

  const activeQual = state.activeStream?.quality || item.quality || '1080p Full HD';
  const activeCodec = state.activeStream?.codec || (item.isLocal ? 'HEVC H.265' : 'HEVC');
  const activeDub = (state.currentDubs || []).find(d => String(d.subjectId) === String(item.subjectId)) || state.currentDubs?.[0];
  const langName = activeDub ? activeDub.lanName : (item.isLocal ? 'Multi-Audio' : 'Original Audio');
  const formatName = item.isLocal ? 'Dolby Atmos 5.1' : getAudioTypeLabel(state.activeAudioType);

  if (badgesRow) {
    badgesRow.innerHTML = `
      <span class="badge-4k">${activeQual}</span>
      <span class="badge-atmos">${activeCodec}</span>
      <span class="badge-hotstar">${langName.toUpperCase()} • ${formatName.toUpperCase()}</span>
    `;
  }
  if (audioInfoEl) {
    const sizeText = state.activeStream?.sizeFormatted ? ` • ${state.activeStream.sizeFormatted}` : '';
    audioInfoEl.textContent = `${langName} • ${formatName}${sizeText}`;
  }
}

function populateQualityDropdown(qualityOptions, isLocal = false) {
  const sel = document.getElementById('qualitySelector');
  if (!sel) return;
  sel.innerHTML = '';

  if (isLocal || !qualityOptions || qualityOptions.length === 0) {
    const opt = document.createElement('option');
    opt.value = '0';
    opt.textContent = state.currentItem?.quality || '4K UHD (2160p)';
    sel.appendChild(opt);
    return;
  }

  qualityOptions.forEach((q, idx) => {
    const opt = document.createElement('option');
    opt.value = String(q.repId !== undefined ? q.repId : idx);
    opt.dataset.qualityLabel = q.quality || q.resolution;
    opt.dataset.sizeFormatted = q.sizeFormatted || '';
    opt.textContent = `${q.quality || q.resolution}${q.sizeFormatted ? ` (${q.sizeFormatted})` : ''}`;
    if (idx === 0) opt.selected = true;
    sel.appendChild(opt);
  });

  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = 'Auto Adaptive';
  sel.appendChild(autoOpt);
}

function populateAudioSelectorDropdown(dubs, activeSubjectId, se, ep) {
  const sel = document.getElementById('audioSelector');
  if (!sel) return;
  sel.innerHTML = '';

  const list = (dubs && dubs.length > 0)
    ? dubs
    : [{ subjectId: activeSubjectId || 'orig', lanName: 'Original Audio', lanCode: 'orig', original: true }];

  const formats = [
    { id: 'aac_stereo', name: 'AAC 2.0 Stereo' },
    { id: 'ddp_surround', name: 'Dolby Surround 5.1' },
    { id: 'vocal_clarity', name: 'Dialogue Clarity' }
  ];

  list.forEach(d => {
    formats.forEach(f => {
      const opt = document.createElement('option');
      opt.value = `${d.subjectId}|${f.id}`;
      opt.textContent = `${d.lanName} — ${f.name}`;
      if (String(d.subjectId) === String(activeSubjectId) && f.id === state.activeAudioType) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
  });

  sel.onchange = () => {
    const [targetSubjId, targetFormat] = String(sel.value).split('|');
    if (targetFormat && targetFormat !== state.activeAudioType) {
      applyWebAudioProfile(targetFormat, true);
    }
    if (targetSubjId && targetSubjId !== 'orig' && String(targetSubjId) !== String(state.currentItem?.subjectId)) {
      const chosenDub = list.find(d => String(d.subjectId) === String(targetSubjId));
      const video = document.getElementById('mainVideo');
      const resumeSec = video ? Math.floor(video.currentTime || 0) : 0;
      showToast(`Switching audio track to ${chosenDub ? chosenDub.lanName : 'Selected Track'}...`);
      openTheaterPlayer({
        ...state.currentItem,
        subjectId: targetSubjId,
        id: `mb_${targetSubjId}`,
        progressSeconds: resumeSec,
        title: `${state.currentItem.cleanTitle || state.currentItem.title} [${chosenDub ? chosenDub.lanName : 'Audio'}]`
      }, se, ep);
    } else {
      showToast(`Audio output set to ${getAudioTypeLabel(state.activeAudioType)}`);
    }
  };
}

function showVideoLoadingRing(label = 'Loading Stream...', sub = 'MovieBox CDN • Multi-Audio HD') {
  const overlay = document.getElementById('videoLoadingOverlay');
  const container = document.getElementById('videoContainer');
  const lblEl = document.getElementById('videoLoadingLabel');
  const subEl = document.getElementById('videoLoadingSub');
  if (lblEl && label) lblEl.textContent = label;
  if (subEl && sub) subEl.textContent = sub;
  if (overlay) overlay.classList.remove('hidden');
  if (container) container.classList.add('is-loading');
}

function hideVideoLoadingRing() {
  const overlay = document.getElementById('videoLoadingOverlay');
  const container = document.getElementById('videoContainer');
  if (overlay) overlay.classList.add('hidden');
  if (container) container.classList.remove('is-loading');
}

function exitWatchView() {
  const video = document.getElementById('mainVideo');
  if (video) video.pause();
  const embedFrame = document.getElementById('streamEmbedFrame');
  if (embedFrame) {
    embedFrame.src = 'about:blank';
    embedFrame.classList.add('hidden');
  }
  if (video) video.classList.remove('hidden');
  document.getElementById('watchView')?.classList.add('hidden');
  document.getElementById('miniPlayerBar')?.classList.add('hidden');

  if (state.previousView === 'dedicated' && state.activeDedicatedPage) {
    document.getElementById('dedicatedPageView')?.classList.remove('hidden');
    document.getElementById('browseView')?.classList.add('hidden');
    document.getElementById('filterChipsBar')?.classList.add('hidden');
  } else {
    document.getElementById('dedicatedPageView')?.classList.add('hidden');
    document.getElementById('browseView')?.classList.remove('hidden');
    document.getElementById('filterChipsBar')?.classList.remove('hidden');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderInPlayerAudioSubPopover(dubs, activeSubjectId, se, ep, subtitles) {
  const langListEl = document.getElementById('inPlayerAudioLangList');
  const subListEl = document.getElementById('inPlayerSubtitlesList');
  if (langListEl) {
    langListEl.innerHTML = '';
    const list = (dubs && dubs.length > 0)
      ? dubs
      : [{ subjectId: activeSubjectId || 'orig', lanName: 'Original Audio', lanCode: 'orig', original: true }];

    list.forEach(d => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isAct = String(d.subjectId) === String(activeSubjectId) || list.length === 1;
      btn.className = `audio-sub-item ${isAct ? 'active' : ''}`;
      btn.textContent = d.lanName;
      btn.onclick = () => {
        if (!isAct && d.subjectId && d.subjectId !== 'local') {
          const video = document.getElementById('mainVideo');
          const resumeSec = video ? Math.floor(video.currentTime || 0) : 0;
          document.getElementById('playerAudioSubPopover')?.classList.add('hidden');
          openTheaterPlayer({
            ...state.currentItem,
            subjectId: d.subjectId,
            id: `mb_${d.subjectId}`,
            progressSeconds: resumeSec,
            title: `${state.currentItem.cleanTitle || state.currentItem.title} [${d.lanName}]`
          }, se, ep);
        }
      };
      langListEl.appendChild(btn);
    });
  }

  document.querySelectorAll('#inPlayerAudioTypeList .audio-sub-item').forEach(btn => {
    const mode = btn.dataset.ipaudiotype;
    btn.classList.toggle('active', mode === state.activeAudioType);
    btn.onclick = () => {
      document.querySelectorAll('#inPlayerAudioTypeList .audio-sub-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyWebAudioProfile(mode, true);
      showToast(`Audio output set to ${getAudioTypeLabel(mode)}`);
    };
  });

  if (subListEl) {
    subListEl.innerHTML = '';
    const subs = Array.isArray(subtitles) ? subtitles : [];
    const offBtn = document.createElement('button');
    offBtn.type = 'button';
    offBtn.className = `audio-sub-item ${subs.length === 0 ? 'active' : ''}`;
    offBtn.textContent = 'Off';
    offBtn.onclick = () => {
      subListEl.querySelectorAll('.audio-sub-item').forEach(b => b.classList.remove('active'));
      offBtn.classList.add('active');
      const sel = document.getElementById('subtitleSelector');
      if (sel) {
        sel.value = 'off';
        sel.dispatchEvent(new Event('change'));
      }
    };

    subs.forEach((sub, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `audio-sub-item ${idx === 0 ? 'active' : ''}`;
      btn.textContent = sub.label;
      btn.onclick = () => {
        subListEl.querySelectorAll('.audio-sub-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sel = document.getElementById('subtitleSelector');
        if (sel) {
          sel.value = sub.vttUrl;
          sel.dispatchEvent(new Event('change'));
        }
      };
      subListEl.appendChild(btn);
    });
    subListEl.appendChild(offBtn);
  }
}

function renderWatchPageBelowTabs(item, se, ep) {
  // 1. Inline Resolution Stream Cards inside Tab 1
  const resGrid = document.getElementById('watchInlineStreamsGrid');
  if (resGrid) {
    resGrid.innerHTML = '';
    const qOpts = (state.currentQualityOptions && state.currentQualityOptions.length > 0)
      ? state.currentQualityOptions
      : [{ quality: item.quality || '1080p Full HD', resolution: '1080p', codec: 'HEVC', sizeFormatted: item.sizeFormatted || 'Direct Stream', repId: 0 }];

    qOpts.forEach((qOpt, idx) => {
      const card = document.createElement('div');
      card.className = `source-item ${idx === 0 ? 'active' : ''}`;
      card.innerHTML = `
        <div class="source-item-top">
          <span class="source-name">${qOpt.quality || qOpt.resolution}</span>
          <span class="source-tag">${qOpt.sizeFormatted || 'HEVC'}</span>
        </div>
        <div class="source-sub">${qOpt.codec || 'HEVC'} • ${getAudioTypeLabel(state.activeAudioType)}</div>
        <div class="wide-actions">
          <button class="card-btn play" data-inline-play>Play ${qOpt.resolution || ''}</button>
          <button class="card-btn vlc" data-inline-vlc>VLC</button>
          <button class="card-btn dl" data-inline-dl>Download</button>
        </div>
      `;
      card.querySelector('[data-inline-play]').onclick = () => {
        const qSel = document.getElementById('qualitySelector');
        if (qSel) {
          qSel.value = String(qOpt.repId !== undefined ? qOpt.repId : idx);
          qSel.dispatchEvent(new Event('change'));
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      card.querySelector('[data-inline-vlc]').onclick = () => launchInVlc(state.currentItem, null, state.activeStream);
      card.querySelector('[data-inline-dl]').onclick = () => startDownload(state.currentItem, state.activeStream);
      resGrid.appendChild(card);
    });
  }

  // 2. More Like This Grid inside Tab 2
  const moreGrid = document.getElementById('watchMoreLikeThisGrid');
  if (moreGrid) {
    moreGrid.innerHTML = '';
    const pool = [
      ...state.top10Movies,
      ...state.top10Series,
      ...(state.mbRows || []).flatMap(r => r.items || [])
    ];
    const seen = new Set([String(item.id), String(item.title)]);
    const recs = [];
    for (const cand of pool) {
      const key = String(cand.id || cand.title);
      if (!seen.has(key) && (cand.poster || cand.backdrop)) {
        seen.add(key);
        recs.push(cand);
      }
      if (recs.length >= 12) break;
    }
    recs.forEach(r => moreGrid.appendChild(buildPosterCard(r)));
  }

  // 3. Technical Specs & Studio Metadata inside Tab 3
  const specsGrid = document.getElementById('watchTechSpecsGrid');
  if (specsGrid) {
    const dubNames = (state.currentDubs || []).map(d => d.lanName).join(', ') || 'Original Audio';
    const subNames = (state.currentSubtitles || []).map(s => s.label).join(', ') || 'English / Embedded';
    specsGrid.innerHTML = `
      <div class="watch-spec-card"><span>Title</span><strong>${item.cleanTitle || item.title}</strong></div>
      <div class="watch-spec-card"><span>Release &amp; Rating</span><strong>${item.year || '2026'} • IMDb ${item.rating || '8.5'}</strong></div>
      <div class="watch-spec-card"><span>Video Resolution</span><strong>${state.activeStream?.quality || item.quality || '1080p Full HD'} (${state.activeStream?.codec || 'HEVC'})</strong></div>
      <div class="watch-spec-card"><span>Audio Tracks</span><strong>${dubNames}</strong></div>
      <div class="watch-spec-card"><span>Audio DSP Engine</span><strong>${getAudioTypeLabel(state.activeAudioType)} (Up to 200% VLC Gain)</strong></div>
      <div class="watch-spec-card"><span>Subtitles</span><strong>${subNames}</strong></div>
      <div class="watch-spec-card"><span>Stream Protocol</span><strong>${state.activeStream?.type ? state.activeStream.type.toUpperCase() : 'MPEG-DASH / Direct HTTP'}</strong></div>
      <div class="watch-spec-card"><span>Genres</span><strong>${(item.genres || ['Drama', 'Action']).join(', ')}</strong></div>
    `;
  }
}

async function openTheaterPlayer(item, overrideSeason = null, overrideEpisode = null) {
  if (!item) return;

  // Remember which page the user launched the player from (Home vs Dedicated Page)
  const watchAlreadyOpen = !document.getElementById('watchView').classList.contains('hidden');
  if (!watchAlreadyOpen) {
    const dedicatedOpen = !document.getElementById('dedicatedPageView')?.classList.contains('hidden');
    state.previousView = dedicatedOpen ? 'dedicated' : 'home';
  }

  state.currentItem = item;

  // Open as a true Dedicated Watch Page (like Netflix / JioHotstar) — hide Browse & Dedicated Category views
  document.getElementById('miniPlayerBar')?.classList.add('hidden');
  document.getElementById('browseView')?.classList.add('hidden');
  document.getElementById('dedicatedPageView')?.classList.add('hidden');
  document.getElementById('filterChipsBar')?.classList.add('hidden');
  document.getElementById('watchView')?.classList.remove('hidden');

  const backLbl = document.getElementById('backFromWatchLabel');
  if (backLbl) {
    backLbl.textContent = (state.previousView === 'dedicated' && state.activeDedicatedTitle)
      ? `Back to ${state.activeDedicatedTitle}`
      : 'Back to Home';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Immediately show the Liquid Glass Loading Ring inside the player
  showVideoLoadingRing(
    `Loading "${item.cleanTitle || item.title}"...`,
    item.isLocal ? 'Local 4K Vault • Direct Stream' : 'Resolving MovieBox CDN Streams & Audio Tracks'
  );

  document.getElementById('playerOverlayTitle').textContent = `${item.cleanTitle || item.title} — Resolving stream...`;
  document.getElementById('watchTitle').textContent = `${item.cleanTitle || item.title} (${item.year || '2026'})`;
  document.getElementById('watchSubtitle').textContent = `${item.year || '2026'} • ${(item.genres || ['Drama']).join(', ')} • IMDb ${item.rating || '8.4'}`;
  document.getElementById('watchDescription').textContent = item.description || '';

  const mkvBanner = document.getElementById('mkvAudioBanner');
  if (item.isLocal && (item.ext === 'MKV' || (item.rawFilename && item.rawFilename.endsWith('.mkv')))) {
    mkvBanner.classList.remove('hidden');
  } else {
    mkvBanner.classList.add('hidden');
  }

  renderUpNextSidebar(item);

  // Case 1: Local File, Live Sports Channel, or Direct Embed Stream
  if (item.isLocal || item.isLive || item.isGaiaFlix || (!item.subjectId && !String(item.id || '').startsWith('mb_') && item.streamUrl)) {
    document.getElementById('watchEpisodesBar').classList.add('hidden');
    document.getElementById('playerOverlayEpisodesBtn')?.classList.add('hidden');
    document.getElementById('nextEpisodeOverlayBtn')?.classList.add('hidden');
    document.getElementById('playerOverlayTitle').textContent = item.cleanTitle || item.title;
    document.getElementById('playerSourcePill').textContent = item.isLocal
      ? `LOCAL 4K • ${item.sizeFormatted || '27.8 GB'}`
      : ((item.isLive || item.isGaiaFlix) ? `LIVE BROADCAST • ${item.badge || '24/7'}` : `DIRECT STREAM • ${item.quality || '1080p Full HD'}`);

    const localDubs = [{
      subjectId: 'local',
      lanName: item.isLocal ? 'Multi-Audio (DDP 5.1 Atmos)' : ((item.isLive || item.isGaiaFlix) ? 'Live Stadium Audio' : 'Original Audio'),
      lanCode: 'en',
      original: true
    }];
    state.currentDubs = localDubs;
    state.currentQualityOptions = [];
    state.currentSubtitles = [];
    renderWatchDubsBar(localDubs, 'local', 0, 0);
    populateAudioSelectorDropdown(localDubs, 'local', 0, 0);
    populateQualityDropdown([], true);
    renderInPlayerAudioSubPopover(localDubs, 'local', 0, 0, []);

    const isM3u8 = item.streamUrl && item.streamUrl.includes('.m3u8');
    const isEmbed = item.isGaiaFlix || (item.streamUrl && (item.streamUrl.includes('/bintv/') || item.streamUrl.includes('bintv-sources.pages.dev') || item.streamUrl.includes('/api/gaiaflix/player')));
    const streamType = isM3u8 ? 'hls' : (isEmbed ? 'embed' : 'mp4');

    state.currentStreams = [{
      id: item.id || 'local_0',
      name: item.isLocal ? `Local 4K Vault • ${item.cleanTitle || item.title}` : (item.cleanTitle || item.title),
      quality: item.quality || '1080p60 LIVE',
      codec: item.isLocal ? 'HEVC H.265' : (isEmbed ? 'Live Embed / H.264' : 'H.264'),
      sizeFormatted: item.sizeFormatted || ((item.isLive || item.isGaiaFlix) ? 'Live Relay' : 'Direct Stream'),
      type: streamType,
      streamUrl: item.streamUrl,
      vlcUrl: item.fullPath || item.streamUrl
    }];
    if (item.streams && Array.isArray(item.streams) && item.streams.length > 0) {
      state.currentStreams = item.streams;
    }
    populateServerSelector(state.currentStreams, 0);
    state.activeStream = state.currentStreams[0];
    updateWatchBadgesAndAudioSummary();
    renderStreamSourcesSidebar();
    renderWatchPageBelowTabs(state.currentItem, 0, 0);
    loadVideoStream(state.activeStream, item.backdrop || item.poster, item.progressSeconds || 0, []);
    saveHistoryEntry(item);
    return;
  }

  // Case 2: Native MovieBox Item (Fetch full details, audio dubs, seasons, and real DASH/MP4 streams!)
  const subjectId = String(item.subjectId || item.id).replace(/^mb_/, '');
  showToast(`Loading "${item.cleanTitle || item.title}" from MovieBox CDN...`);

  try {
    const detRes = await fetch(`/api/moviebox/details?subjectId=${encodeURIComponent(subjectId)}`);
    const detJson = await detRes.json();
    let se = overrideSeason !== null ? overrideSeason : Number(item.season || 0);
    let ep = overrideEpisode !== null ? overrideEpisode : Number(item.episode || 0);

    if (detJson.ok && detJson.details) {
      const det = detJson.details;
      state.currentItem = { ...item, ...det };
      state.currentDubs = det.dubs || [];

      const durText = det.durationSeconds > 0 ? ` • ${Math.round(det.durationSeconds / 60)} min` : '';
      document.getElementById('watchTitle').textContent = `${det.cleanTitle || det.title} (${det.year})`;
      document.getElementById('watchSubtitle').textContent = `${det.year} • ${(det.genres || ['Drama']).join(', ')} • IMDb ${det.rating || '8.4'}${durText}`;
      document.getElementById('watchDescription').textContent = det.description || item.description;

      // Only set se=1, ep=1 if this item is genuinely a TV Series (stype === 2)
      if (Number(det.stype) === 2 && se === 0 && ep === 0) {
        se = 1;
        ep = 1;
      } else if (Number(det.stype) === 1) {
        se = 0;
        ep = 0;
      }

      state.currentItem.season = se;
      state.currentItem.episode = ep;

      renderWatchDubsBar(state.currentDubs, subjectId, se, ep);
      populateAudioSelectorDropdown(state.currentDubs, subjectId, se, ep);
      renderWatchEpisodesBar(det.seasons || [], subjectId, se, ep);
    }

    showVideoLoadingRing(
      `Connecting to ${state.currentItem.cleanTitle || state.currentItem.title}...`,
      se > 0 ? `Season ${se} • Episode ${ep} • 1080p Full HD` : '1080p Full HD • HEVC Stream'
    );

    // Fetch real streams for (subjectId, se, ep)
    const stRes = await fetch(`/api/moviebox/streams?subjectId=${encodeURIComponent(subjectId)}&se=${se}&ep=${ep}`);
    const stJson = await stRes.json();

    if (stJson.ok && stJson.streams && stJson.streams.length > 0) {
      state.currentStreams = stJson.streams;
      state.currentQualityOptions = stJson.qualityOptions || [];
      state.currentSubtitles = stJson.subtitles || [];
      state.activeStream = state.currentStreams[0];

      const epLabel = se > 0 ? ` • S${String(se).padStart(2, '0')}E${String(ep).padStart(2, '0')}` : '';
      document.getElementById('playerOverlayTitle').textContent = `${state.currentItem.cleanTitle || state.currentItem.title}${epLabel}`;
      document.getElementById('playerSourcePill').textContent = `MOVIEBOX CDN • ${state.activeStream.quality} (${state.activeStream.sizeFormatted || 'HEVC'})`;
      document.getElementById('watchProviderLabel').textContent = state.activeStream.name;

      populateServerSelector(state.currentStreams, 0);
      populateQualityDropdown(state.currentQualityOptions, false);
      updateWatchBadgesAndAudioSummary();
      renderStreamSourcesSidebar();
      populateSubtitlesDropdown(state.currentSubtitles);
      renderInPlayerAudioSubPopover(state.currentDubs, subjectId, se, ep, state.currentSubtitles);
      renderWatchPageBelowTabs(state.currentItem, se, ep);
      loadVideoStream(
        state.activeStream,
        state.currentItem.backdrop || state.currentItem.poster,
        item.progressSeconds || 0,
        state.currentSubtitles
      );
      saveHistoryEntry({ ...state.currentItem, season: se, episode: ep });
      showToast(`Playing "${state.currentItem.cleanTitle || state.currentItem.title}${epLabel}"`);
    } else {
      hideVideoLoadingRing();
      showToast(`No direct streams found for this title on MovieBox`);
    }
  } catch (err) {
    hideVideoLoadingRing();
    showToast(`Stream error: ${err.message}`);
  }
}

function populateServerSelector(streams, activeIndex = 0) {
  const selectors = [
    document.getElementById('serverSelector'),
    document.getElementById('topServerSelector')
  ].filter(Boolean);

  selectors.forEach(sel => {
    sel.innerHTML = '';
    (streams || []).forEach((st, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = st.name || `Server ${idx + 1}`;
      if (idx === activeIndex) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.classList.toggle('hidden', !streams || streams.length <= 1);
  });
}

function onServerChange(idx) {
  const targetIdx = Number(idx);
  if (!state.currentStreams || !state.currentStreams[targetIdx]) return;
  const newStream = state.currentStreams[targetIdx];
  state.activeStream = newStream;
  showToast(`Switched to ${newStream.name}`);
  loadVideoStream(newStream, state.currentItem?.backdrop || state.currentItem?.poster, 0, state.currentSubtitles);
  const s1 = document.getElementById('serverSelector');
  const s2 = document.getElementById('topServerSelector');
  if (s1 && s1.value !== String(targetIdx)) s1.value = String(targetIdx);
  if (s2 && s2.value !== String(targetIdx)) s2.value = String(targetIdx);
  const pill = document.getElementById('playerSourcePill');
  if (pill) pill.textContent = (newStream.name || 'STREAM').toUpperCase();
}

function renderWatchDubsBar(dubs, activeSubjectId, se, ep) {
  const bar = document.getElementById('watchDubsBar');
  const container = document.getElementById('watchDubsPills');
  if (!bar || !container) return;

  bar.classList.remove('hidden');
  container.innerHTML = '';

  const list = (dubs && dubs.length > 0)
    ? dubs
    : [{ subjectId: activeSubjectId, lanName: 'Original Audio', lanCode: 'orig', original: true }];

  list.forEach(d => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = String(d.subjectId) === String(activeSubjectId) || list.length === 1;
    btn.className = `dub-pill ${isActive ? 'active' : ''}`;
    btn.textContent = d.lanName;
    btn.addEventListener('click', () => {
      if (!isActive && d.subjectId && d.subjectId !== 'local') {
        const video = document.getElementById('mainVideo');
        const resumeSec = video ? Math.floor(video.currentTime || 0) : 0;
        showToast(`Switching audio language to ${d.lanName}...`);
        openTheaterPlayer({
          ...state.currentItem,
          subjectId: d.subjectId,
          id: `mb_${d.subjectId}`,
          progressSeconds: resumeSec,
          title: `${state.currentItem.cleanTitle || state.currentItem.title} [${d.lanName}]`
        }, se, ep);
      }
    });
    container.appendChild(btn);
  });

  // Bind Audio Format / Type pills in Watch Bar
  document.querySelectorAll('#watchAudioFormatPills .dub-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.audiotype === state.activeAudioType);
    btn.onclick = () => {
      const mode = btn.dataset.audiotype;
      applyWebAudioProfile(mode, true);
      const audioSel = document.getElementById('audioSelector');
      if (audioSel) {
        const targetVal = `${activeSubjectId}|${mode}`;
        if ([...audioSel.options].some(o => o.value === targetVal)) {
          audioSel.value = targetVal;
        }
      }
      showToast(`Audio output set to ${getAudioTypeLabel(mode)}`);
    };
  });
}

function renderWatchEpisodesBar(seasons, subjectId, activeSeason, activeEpisode) {
  const bar = document.getElementById('watchEpisodesBar');
  const selectEl = document.getElementById('watchSeasonSelect');
  const pillsEl = document.getElementById('watchEpisodePills');
  const cardsGridEl = document.getElementById('watchEpisodeCardsGrid');
  const topEpBtn = document.getElementById('playerOverlayEpisodesBtn');
  const nextEpBtn = document.getElementById('nextEpisodeOverlayBtn');
  if (!bar || !selectEl || !pillsEl) return;

  if (!seasons || seasons.length === 0) {
    bar.classList.add('hidden');
    topEpBtn?.classList.add('hidden');
    nextEpBtn?.classList.add('hidden');
    if (cardsGridEl) cardsGridEl.innerHTML = '';
    return;
  }

  bar.classList.remove('hidden');
  topEpBtn?.classList.remove('hidden');
  nextEpBtn?.classList.remove('hidden');
  selectEl.innerHTML = '';

  const foundCurrentSeason = seasons.find(s => Number(s.season) === Number(activeSeason)) || seasons[0];
  if (nextEpBtn) {
    const nextEpNum = (activeEpisode || 1) + 1;
    if (nextEpNum <= (foundCurrentSeason.maxEp || 1)) {
      nextEpBtn.textContent = `Next Episode (S${activeSeason}E${nextEpNum})`;
      nextEpBtn.onclick = () => openTheaterPlayer(state.currentItem, Number(activeSeason), nextEpNum);
    } else {
      nextEpBtn.classList.add('hidden');
    }
  }

  seasons.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.season;
    opt.textContent = `Season ${s.season} (${s.maxEp} Episodes)`;
    if (s.season === activeSeason) opt.selected = true;
    selectEl.appendChild(opt);
  });

  function renderEpButtons(seasonNum) {
    pillsEl.innerHTML = '';
    if (cardsGridEl) cardsGridEl.innerHTML = '';
    const foundSeason = seasons.find(s => s.season === Number(seasonNum)) || seasons[0];
    const maxEp = Math.min(foundSeason.maxEp || 1, 50);
    const thumbImg = state.currentItem?.backdrop || state.currentItem?.poster || '';

    for (let ep = 1; ep <= maxEp; ep++) {
      const isAct = Number(seasonNum) === activeSeason && ep === activeEpisode;
      const btn = document.createElement('button');
      btn.className = `ep-pill ${isAct ? 'active' : ''}`;
      btn.textContent = `EP ${ep}`;
      btn.addEventListener('click', () => {
        openTheaterPlayer(state.currentItem, Number(seasonNum), ep);
      });
      pillsEl.appendChild(btn);

      if (cardsGridEl && ep <= 24) {
        const epCard = document.createElement('div');
        epCard.className = `watch-ep-card ${isAct ? 'active' : ''}`;
        epCard.innerHTML = `
          <img class="watch-ep-thumb" src="${thumbImg}" alt="Episode ${ep}" loading="lazy" />
          <div class="watch-ep-info">
            <strong>S${String(seasonNum).padStart(2, '0')}E${String(ep).padStart(2, '0')} — Episode ${ep}</strong>
            <span>${isAct ? 'Now Playing • ' : ''}1080p Full HD • Multi-Audio</span>
          </div>
        `;
        epCard.addEventListener('click', () => {
          openTheaterPlayer(state.currentItem, Number(seasonNum), ep);
        });
        cardsGridEl.appendChild(epCard);
      }
    }
  }

  selectEl.onchange = () => renderEpButtons(Number(selectEl.value));
  renderEpButtons(activeSeason || 1);
}

function populateSubtitlesDropdown(subtitles) {
  const sel = document.getElementById('subtitleSelector');
  if (!sel) return;
  sel.innerHTML = '';

  const offOpt = document.createElement('option');
  offOpt.value = 'off';
  offOpt.textContent = 'Subtitles: Off';

  if (!subtitles || subtitles.length === 0) {
    sel.appendChild(offOpt);
    return;
  }

  subtitles.forEach((sub, idx) => {
    const opt = document.createElement('option');
    opt.value = sub.vttUrl;
    opt.dataset.srt = sub.srtUrl;
    opt.textContent = `Subtitles: ${sub.label}`;
    if (idx === 0) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.appendChild(offOpt);
}

function loadVideoStream(streamObj, posterUrl, startSeconds = 0, subtitles = []) {
  const video = document.getElementById('mainVideo');
  if (!video || !streamObj) return;

  showVideoLoadingRing(
    `Buffering ${streamObj.quality || '1080p Full HD'}...`,
    `${streamObj.name || 'MovieBox CDN'} • ${getAudioTypeLabel(state.activeAudioType)}`
  );

  const url = streamObj.streamUrl;
  if (posterUrl) video.poster = posterUrl;

  // Ensure audio is unmuted and at full user-selected volume
  const sliderVal = Number(document.getElementById('volumeSlider')?.value || 1);
  video.muted = sliderVal === 0;
  video.volume = Math.min(1, sliderVal > 0 ? sliderVal : 1);

  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  if (state.dashInstance) {
    state.dashInstance.reset();
    state.dashInstance = null;
  }

  video.querySelectorAll('track').forEach(t => t.remove());
  if (Array.isArray(subtitles) && subtitles.length > 0) {
    subtitles.slice(0, 6).forEach((sub, idx) => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = sub.label;
      track.srclang = sub.lang || 'en';
      track.src = sub.vttUrl;
      if (idx === 0) track.default = true;
      video.appendChild(track);
    });
  }

  const embedFrame = document.getElementById('streamEmbedFrame');
  const isEmbedStream = streamObj.type === 'embed' || url.includes('/bintv/') || url.includes('bintv-sources.pages.dev') || url.includes('/api/gaiaflix/player') || url.includes('vidsrc') || url.includes('vidlink') || url.includes('autoembed') || url.includes('2embed') || url.includes('superembed') || url.includes('embed.su') || url.includes('smashystream') || url.includes('rive.');

  if (isEmbedStream && embedFrame) {
    video.pause();
    video.classList.add('hidden');
    embedFrame.classList.remove('hidden');
    let playerUrl = url;
    if (url.includes('/bintv/') || url.includes('bintv-sources.pages.dev') || url.includes('ehgembxe.cfd')) {
      playerUrl = `/api/gaiaflix/player?url=${encodeURIComponent(url)}`;
    }
    embedFrame.src = playerUrl;
    embedFrame.onload = () => {
      hideVideoLoadingRing();
    };
    return;
  } else if (embedFrame) {
    embedFrame.classList.add('hidden');
    embedFrame.src = 'about:blank';
    video.classList.remove('hidden');
  }

  // 1. MPEG-DASH (.mpd) via dash.js
  if (streamObj.type === 'dash' || url.endsWith('.mpd')) {
    if (window.dashjs) {
      const dashPlayer = dashjs.MediaPlayer().create();
      dashPlayer.updateSettings({
        streaming: {
          buffer: { fastSwitchEnabled: true },
          abr: { autoSwitchBitrate: { video: true } }
        }
      });
      dashPlayer.initialize(video, url, true, startSeconds);

      dashPlayer.on(dashjs.MediaPlayer.events.PLAYBACK_PLAYING, () => {
        hideVideoLoadingRing();
      });
      dashPlayer.on(dashjs.MediaPlayer.events.CAN_PLAY, () => {
        hideVideoLoadingRing();
      });
      dashPlayer.on(dashjs.MediaPlayer.events.BUFFER_EMPTY, () => {
        showVideoLoadingRing('Buffering Stream...', `${streamObj.quality || '1080p Full HD'} • Adaptive DASH`);
      });
      dashPlayer.on(dashjs.MediaPlayer.events.BUFFER_LOADED, () => {
        hideVideoLoadingRing();
      });

      let triedFallbackQuality = false;
      dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e) => {
        console.warn('DASH playback event:', e);
        // If ultrawide CinemaScope 1080p (rep 0) fails on older GPU hardware, auto-switch to 720p (rep 1)
        if (!triedFallbackQuality) {
          triedFallbackQuality = true;
          try {
            dashPlayer.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
            dashPlayer.setQualityFor('video', 1, true);
            return;
          } catch {}
        }
        hideVideoLoadingRing();
        document.getElementById('mkvAudioBanner').classList.remove('hidden');
      });
      state.dashInstance = dashPlayer;
    } else {
      video.src = url;
      video.play().catch(() => {});
    }
  }
  // 2. HLS (.m3u8) via hls.js or Native Safari / iOS WebKit engine
  else if (url.includes('.m3u8')) {
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, () => {
        hideVideoLoadingRing();
      });
      state.hlsInstance = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        if (startSeconds > 0 && startSeconds < video.duration) {
          video.currentTime = startSeconds;
        }
        video.play().catch(() => {});
      }, { once: true });
    } else {
      video.src = url;
      video.play().catch(() => {});
    }
  }
  // 3. Direct MP4 / MKV
  else {
    video.src = url;
    video.load();
    video.onloadedmetadata = () => {
      if (startSeconds > 0 && startSeconds < video.duration) {
        video.currentTime = startSeconds;
      }
      video.play().catch(() => {});
    };
  }

  applyWebAudioProfile(state.activeAudioType, false);
  updateVideoFilterStyles();
  startAmbientCanvasLoop();
}

function startAmbientCanvasLoop() {
  const video = document.getElementById('mainVideo');
  const canvas = document.getElementById('ambientCanvas');
  if (!video || !canvas) return;
  const ctx = canvas.getContext('2d');

  if (state.ambientFrameId) cancelAnimationFrame(state.ambientFrameId);

  let lastDraw = 0;
  function renderLoop(ts) {
    if (ts - lastDraw > 75) {
      lastDraw = ts;
      if (!video.paused && !video.ended && state.uiData.ambientMode !== false) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch {}
      }
    }
    state.ambientFrameId = requestAnimationFrame(renderLoop);
  }
  state.ambientFrameId = requestAnimationFrame(renderLoop);
}

function renderStreamSourcesSidebar() {
  const list = document.getElementById('streamSourcesList');
  if (!list) return;
  list.innerHTML = '';

  // Show each resolution option as a selectable stream card if qualityOptions are available
  if (state.currentQualityOptions && state.currentQualityOptions.length > 0 && state.currentStreams.length > 0) {
    const baseStream = state.currentStreams[0];
    state.currentQualityOptions.forEach((qOpt, idx) => {
      const div = document.createElement('div');
      div.className = `source-item ${idx === 0 ? 'active' : ''}`;
      div.innerHTML = `
        <div class="source-item-top">
          <span class="source-name">MovieBox CDN • ${qOpt.quality}</span>
          <span class="source-tag">${qOpt.sizeFormatted}</span>
        </div>
        <div class="source-sub">${qOpt.codec || 'HEVC'} • ${getAudioTypeLabel(state.activeAudioType)}</div>
        <div class="wide-actions">
          <button class="card-btn play" data-src-play>Switch to ${qOpt.resolution}</button>
          <button class="card-btn vlc" data-src-vlc>VLC</button>
          <button class="card-btn dl" data-src-dl>Download</button>
        </div>
      `;

      div.querySelector('[data-src-play]').addEventListener('click', () => {
        list.querySelectorAll('.source-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        const qSel = document.getElementById('qualitySelector');
        if (qSel) {
          qSel.value = String(qOpt.repId || idx);
          qSel.dispatchEvent(new Event('change'));
        }
      });

      div.querySelector('[data-src-vlc]').addEventListener('click', () => {
        launchInVlc(state.currentItem, null, baseStream);
      });

      div.querySelector('[data-src-dl]').addEventListener('click', () => {
        startDownload(state.currentItem, baseStream);
      });

      list.appendChild(div);
    });
    return;
  }

  state.currentStreams.forEach(src => {
    const isActive = state.activeStream && state.activeStream.id === src.id;
    const div = document.createElement('div');
    div.className = `source-item ${isActive ? 'active' : ''}`;
    div.innerHTML = `
      <div class="source-item-top">
        <span class="source-name">${src.name}</span>
        <span class="source-tag">${src.quality}</span>
      </div>
      <div class="source-sub">${src.codec || 'HEVC'} • ${src.sizeFormatted || 'Direct Stream'}</div>
      <div class="wide-actions">
        <button class="card-btn play" data-src-play>Play in Theater</button>
        <button class="card-btn vlc" data-src-vlc>Open in VLC</button>
      </div>
    `;

    div.querySelector('[data-src-play]').addEventListener('click', () => {
      state.activeStream = src;
      renderStreamSourcesSidebar();
      loadVideoStream(src, state.currentItem?.backdrop, 0, state.currentSubtitles);
      showToast(`Switched stream to ${src.name}`);
    });

    div.querySelector('[data-src-vlc]').addEventListener('click', () => {
      launchInVlc(state.currentItem, null, src);
    });

    list.appendChild(div);
  });
}

function renderUpNextSidebar(currentItem) {
  const list = document.getElementById('upNextList');
  if (!list) return;
  list.innerHTML = '';

  const queue = [
    ...state.localMedia,
    ...state.top10Movies.slice(0, 6),
    ...state.top10Series.slice(0, 6)
  ].filter(x => x.title !== currentItem.title).slice(0, 10);

  queue.forEach(q => {
    const card = document.createElement('div');
    card.className = 'upnext-card';
    card.innerHTML = `
      <img src="${q.backdrop || q.poster}" alt="${q.title}" loading="lazy" />
      <div class="upnext-info">
        <div class="upnext-title">${q.cleanTitle || q.title}</div>
        <div class="upnext-meta">${q.year || '2026'} • ${q.quality || '1080p Full HD'} • IMDb ${q.rating || '8.4'}</div>
      </div>
    `;
    card.addEventListener('click', () => openTheaterPlayer(q));
    list.appendChild(card);
  });
}

// =========================================================================
// 5. LAUNCH IN VLC MEDIA PLAYER (RESOLVES REAL MOVIEBOX STREAM AUTOMATICALLY!)
// =========================================================================
async function launchInVlc(item, overrideStartTime = null, explicitStreamObj = null) {
  if (!item) return;
  const video = document.getElementById('mainVideo');
  const currentSec = overrideStartTime !== null
    ? overrideStartTime
    : (state.currentItem && state.currentItem.id === item.id && video ? Math.floor(video.currentTime) : (item.progressSeconds || 0));

  if (video && !video.paused) video.pause();

  let targetUrl = explicitStreamObj?.vlcUrl || item.fullPath || item.streamUrl || null;
  let subtitleUrl = state.currentSubtitles?.[0]?.srtUrl || null;
  let headers = explicitStreamObj?.headers || null;

  if (!targetUrl && (item.subjectId || String(item.id).startsWith('mb_'))) {
    const subjectId = String(item.subjectId || item.id).replace(/^mb_/, '');
    const se = item.season || (item.type === 'series' || item.stype === 2 ? 1 : 0);
    const ep = item.episode || (item.type === 'series' || item.stype === 2 ? 1 : 0);
    showToast(`Resolving MovieBox stream for "${item.cleanTitle || item.title}" to open in VLC...`);

    try {
      const stRes = await fetch(`/api/moviebox/streams?subjectId=${encodeURIComponent(subjectId)}&se=${se}&ep=${ep}`);
      const stJson = await stRes.json();
      if (stJson.ok && stJson.streams && stJson.streams.length > 0) {
        const best = stJson.streams[0];
        targetUrl = best.vlcUrl || best.streamUrl;
        headers = best.headers || null;
        if (stJson.subtitles && stJson.subtitles.length > 0) {
          subtitleUrl = stJson.subtitles[0].srtUrl;
        }
      }
    } catch (err) {
      return showToast(`Could not resolve MovieBox stream: ${err.message}`);
    }
  }

  if (!targetUrl) {
    return showToast(`No stream URL found for "${item.title}"`);
  }

  const isRemoteHost = !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isMobileOrTablet = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && window.innerWidth <= 1180);

  if (isRemoteHost && isMobileOrTablet) {
    let mobileStreamUrl = item.streamUrl || targetUrl;
    if (mobileStreamUrl.startsWith('/')) {
      mobileStreamUrl = `${window.location.origin}${mobileStreamUrl}`;
    } else if (mobileStreamUrl.includes('localhost:')) {
      mobileStreamUrl = mobileStreamUrl.replace(/localhost:\d+/, window.location.host);
    }
    showToast(`Opening "${item.cleanTitle || item.title}" in Mobile VLC App...`);
    saveHistoryEntry(item, currentSec);
    window.location.href = `vlc://${mobileStreamUrl.replace(/^https?:\/\//i, '')}`;
    return;
  }

  showToast(`Launching "${item.cleanTitle || item.title}" in VLC Media Player...`);
  try {
    const res = await fetch('/api/vlc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vlcUrl: targetUrl,
        title: `${item.cleanTitle || item.title} (${item.quality || '1080p Full HD'})`,
        startTime: currentSec,
        subtitleUrl,
        headers
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Playing "${item.cleanTitle || item.title}" in VLC Media Player`);
      saveHistoryEntry(item, currentSec);
    } else {
      showToast(`VLC Error: ${data.error}`);
    }
  } catch (err) {
    showToast(`Could not launch VLC: ${err.message}`);
  }
}

async function saveHistoryEntry(item, progressSec = 0) {
  try {
    await fetch('/api/save-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uiData: state.uiData,
        historyEntry: {
          id: item.id,
          subjectId: item.subjectId,
          title: item.title,
          poster: item.poster || item.backdrop,
          year: item.year || '2026',
          type: item.type || 'movie',
          season: item.season || 0,
          episode: item.episode || 0,
          quality: item.quality || '1080p Full HD',
          progress: progressSec
        }
      })
    });
  } catch {}
}

// =========================================================================
// 6. DETAILS, AUDIO TRACKS & RESOLUTIONS MODAL
// =========================================================================
async function openDetailsModal(item) {
  if (!item) return;
  const modal = document.getElementById('detailsModal');
  modal.classList.remove('hidden');

  document.getElementById('modalBackdropImg').src = item.backdrop || item.poster;
  document.getElementById('modalTitle').textContent = item.cleanTitle || item.title;
  document.getElementById('modalSynopsis').textContent = item.description || '';
  document.getElementById('modalProvider').textContent = item.provider || 'MovieBox CDN';
  document.getElementById('modalGenres').textContent = (item.genres || ['Drama']).join(', ');
  document.getElementById('modalAudio').textContent = item.languages || 'Original Stereo & 5.1';

  const modalBadges = document.getElementById('modalBadges');
  if (modalBadges) {
    modalBadges.innerHTML = `
      <span class="badge-4k">${item.quality || '1080p Full HD'}</span>
      <span class="badge-atmos">${item.isLocal ? 'DOLBY ATMOS' : 'HEVC'}</span>
      <span class="badge-hotstar">${item.type === 'series' ? 'TV SERIES' : 'FEATURE FILM'}</span>
    `;
  }

  document.getElementById('modalMetaRow').innerHTML = `
    <span class="match-score">98% Match</span>
    <span class="meta-year">${item.year || '2026'}</span>
    <span class="quality-box">${item.quality || '1080p Full HD'}</span>
    <span class="imdb-box">IMDb ${item.rating || '8.4'}</span>
  `;

  document.getElementById('modalPlayBtn').onclick = () => {
    modal.classList.add('hidden');
    openTheaterPlayer(item);
  };
  document.getElementById('modalVlcBtn').onclick = () => {
    modal.classList.add('hidden');
    launchInVlc(item);
  };
  const modalDlBtn = document.getElementById('modalDownloadBtn');
  if (modalDlBtn) {
    modalDlBtn.onclick = () => {
      modal.classList.add('hidden');
      startDownload(item);
    };
  }
  document.getElementById('modalListBtn').onclick = () => {
    toggleWatchlist(item);
  };

  const audioPillsEl = document.getElementById('modalAudioPills');
  if (audioPillsEl) {
    audioPillsEl.innerHTML = `<span class="dub-pill active">${item.languages || 'Original Audio (AAC 2.0 Stereo)'}</span>`;
  }

  const epList = document.getElementById('modalEpisodesList');
  epList.innerHTML = `<div class="source-sub">Resolving audio tracks, resolutions, and exact file sizes...</div>`;

  if (item.subjectId || String(item.id).startsWith('mb_')) {
    const subjectId = String(item.subjectId || item.id).replace(/^mb_/, '');
    try {
      const [detRes, stRes] = await Promise.all([
        fetch(`/api/moviebox/details?subjectId=${encodeURIComponent(subjectId)}`),
        fetch(`/api/moviebox/streams?subjectId=${encodeURIComponent(subjectId)}&se=${item.type === 'series' || item.stype === 2 ? 1 : 0}&ep=${item.type === 'series' || item.stype === 2 ? 1 : 0}`)
      ]);
      const data = await detRes.json();
      const stData = await stRes.json();

      if (data.ok && data.details) {
        const det = data.details;
        document.getElementById('modalSynopsis').textContent = det.description || item.description;
        document.getElementById('modalGenres').textContent = (det.genres || item.genres || ['Drama']).join(', ');

        const topQual = stData?.qualityOptions?.[0]?.quality || det.quality || '1080p Full HD';
        const durMin = det.durationSeconds > 0 ? `<span>${Math.round(det.durationSeconds / 60)} min</span>` : '';
        document.getElementById('modalMetaRow').innerHTML = `
          <span class="match-score">98% Match</span>
          <span class="meta-year">${det.year || '2026'}</span>
          ${durMin}
          <span class="quality-box">${topQual}</span>
          <span class="imdb-box">IMDb ${det.rating || '8.4'}</span>
        `;

        if (det.dubs && det.dubs.length > 0) {
          document.getElementById('modalAudio').textContent = det.dubs.map(d => d.lanName).join(' • ');
          if (audioPillsEl) {
            audioPillsEl.innerHTML = '';
            det.dubs.forEach(d => {
              const btn = document.createElement('button');
              btn.type = 'button';
              const isAct = String(d.subjectId) === String(subjectId);
              btn.className = `dub-pill ${isAct ? 'active' : ''}`;
              btn.textContent = d.lanName;
              btn.onclick = () => {
                modal.classList.add('hidden');
                openTheaterPlayer({
                  ...det,
                  subjectId: d.subjectId,
                  id: `mb_${d.subjectId}`,
                  title: `${det.cleanTitle || det.title} [${d.lanName}]`
                });
              };
              audioPillsEl.appendChild(btn);
            });
          }
        }

        epList.innerHTML = '';

        // 1. Show exact Resolution & File Size stream cards from backend
        if (stData.ok && Array.isArray(stData.qualityOptions) && stData.qualityOptions.length > 0) {
          const primaryStream = stData.streams?.[0] || null;
          stData.qualityOptions.forEach(qOpt => {
            const row = document.createElement('div');
            row.className = 'source-item';
            row.innerHTML = `
              <div class="source-item-top">
                <span class="source-name">${det.cleanTitle || det.title} — ${qOpt.quality}</span>
                <span class="source-tag">${qOpt.sizeFormatted} • ${qOpt.codec || 'HEVC'}</span>
              </div>
              <div class="source-sub">Audio: ${(det.dubs || []).map(d => d.lanName).join(', ') || 'Original Stereo'} • AAC 2.0 / Surround 5.1</div>
              <div class="wide-actions">
                <button class="card-btn play" data-q-play>Play ${qOpt.resolution}</button>
                <button class="card-btn vlc" data-q-vlc>Open in VLC</button>
                <button class="card-btn dl" data-q-dl>Download (${qOpt.sizeFormatted})</button>
              </div>
            `;
            row.querySelector('[data-q-play]').onclick = () => {
              modal.classList.add('hidden');
              openTheaterPlayer(det);
            };
            row.querySelector('[data-q-vlc]').onclick = () => {
              modal.classList.add('hidden');
              launchInVlc(det, null, primaryStream);
            };
            row.querySelector('[data-q-dl]').onclick = () => {
              modal.classList.add('hidden');
              startDownload(det, primaryStream);
            };
            epList.appendChild(row);
          });
        }

        // 2. Show Season 1 Episodes if series
        if (det.seasons && det.seasons.length > 0) {
          const s1 = det.seasons[0];
          const maxEp = Math.min(s1.maxEp || 1, 20);
          for (let ep = 1; ep <= maxEp; ep++) {
            const row = document.createElement('div');
            row.className = 'source-item';
            row.innerHTML = `
              <div class="source-item-top">
                <span class="source-name">Season ${s1.season} • Episode ${ep}</span>
                <span class="source-tag">1080p Full HD • HEVC</span>
              </div>
              <div class="wide-actions">
                <button class="card-btn play" data-e-play>Play S${s1.season}E${ep}</button>
                <button class="card-btn vlc" data-e-vlc>VLC</button>
                <button class="card-btn dl" data-e-dl title="Download S${s1.season}E${ep}">Download</button>
              </div>
            `;
            const epItem = { ...det, season: s1.season, episode: ep };
            row.querySelector('[data-e-play]').onclick = () => {
              modal.classList.add('hidden');
              openTheaterPlayer(epItem, s1.season, ep);
            };
            row.querySelector('[data-e-vlc]').onclick = () => {
              modal.classList.add('hidden');
              launchInVlc(epItem);
            };
            row.querySelector('[data-e-dl]').onclick = () => {
              modal.classList.add('hidden');
              startDownload(epItem);
            };
            epList.appendChild(row);
          }
        }
        if (epList.children.length > 0) return;
      }
    } catch {}
  }

  epList.innerHTML = `
    <div class="source-item">
      <div class="source-item-top">
        <span class="source-name">${item.title} — Direct Stream</span>
        <span class="source-tag">${item.quality || '4K UHD / 1080p'}</span>
      </div>
      <div class="wide-actions">
        <button class="card-btn play" id="fallbackModalPlay">Play</button>
        <button class="card-btn vlc" id="fallbackModalVlc">Open in VLC</button>
        <button class="card-btn dl" id="fallbackModalDl">Download</button>
      </div>
    </div>
  `;
  document.getElementById('fallbackModalPlay').onclick = () => {
    modal.classList.add('hidden');
    openTheaterPlayer(item);
  };
  document.getElementById('fallbackModalVlc').onclick = () => {
    modal.classList.add('hidden');
    launchInVlc(item);
  };
  document.getElementById('fallbackModalDl').onclick = () => {
    modal.classList.add('hidden');
    startDownload(item);
  };
}

function toggleWatchlist(item) {
  const list = state.uiData.watchlist || [];
  const idx = list.indexOf(item.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    showToast(`Removed "${item.cleanTitle || item.title}" from Watchlist`);
  } else {
    list.unshift(item.id);
    showToast(`Added "${item.cleanTitle || item.title}" to Watchlist`);
  }
  state.uiData.watchlist = list;
  saveHistoryEntry(item);
  setActiveHero(state.activeHeroIndex);
}

// =========================================================================
// 7. LIVE MOVIEBOX + 4KHDHUB SEARCH & UI EVENTS
// =========================================================================
let searchDebounce = null;
async function performSearch(query) {
  const dropdown = document.getElementById('searchDropdown');
  const listEl = document.getElementById('searchDropdownList');
  const statusEl = document.getElementById('searchStatusText');

  if (!query || query.trim().length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

  dropdown.classList.remove('hidden');
  statusEl.textContent = `Searching MovieBox + 4KHDHub + D:\\Home Theater for "${query}"...`;
  listEl.innerHTML = '';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = data.results || [];
    statusEl.textContent = `Found ${results.length} results (${data.counts?.moviebox || 0} MovieBox, ${data.counts?.fourkhdhub || 0} 4KHDHub, ${data.counts?.local || 0} Local)`;

    results.slice(0, 14).forEach(item => {
      const row = document.createElement('div');
      row.className = 'search-dropdown-item';
      row.innerHTML = `
        <img src="${item.poster || item.backdrop}" alt="${item.title}" />
        <div class="s-item-info">
          <div class="s-item-title">${item.title}</div>
          <div class="s-item-meta">${item.year || '2026'} • ${item.provider} • ${item.type === 'series' ? 'Series' : 'Movie'} • ★ ${item.rating || '8.4'}</div>
        </div>
        <div class="s-item-actions">
          <button class="card-btn play" style="padding:0 10px" data-s-play>Play</button>
          <button class="card-btn vlc" style="padding:0 10px" data-s-vlc>VLC</button>
          <button class="card-btn dl" style="padding:0 10px" data-s-dl>Save</button>
        </div>
      `;
      row.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-s-vlc')) {
          launchInVlc(item);
        } else if (e.target.hasAttribute('data-s-dl')) {
          startDownload(item);
        } else {
          openTheaterPlayer(item);
        }
        dropdown.classList.add('hidden');
      });
      listEl.appendChild(row);
    });
  } catch (err) {
    statusEl.textContent = `Search error: ${err.message}`;
  }
}

function collectAllCatalogItems() {
  const map = new Map();
  const addItem = (it, defaultCat = '') => {
    if (!it || (!it.title && !it.cleanTitle)) return;
    const key = String(it.subjectId || it.id || it.title);
    if (!map.has(key)) {
      map.set(key, { ...it, _rowCategory: it._rowCategory || defaultCat });
    }
  };

  (state.localMedia || []).forEach(it => addItem(it, 'local'));
  (state.heroes || []).forEach(it => addItem(it, 'featured'));
  (state.top10Movies || []).forEach(it => addItem(it, 'movies'));
  (state.top10Series || []).forEach(it => addItem(it, 'series'));
  (state.moviesCatalog || []).forEach(it => addItem(it, 'movies'));
  (state.seriesCatalog || []).forEach(it => addItem(it, 'series'));
  (state.animeCatalog || []).forEach(it => addItem(it, 'anime'));
  (state.mbRows || []).forEach(r => {
    const rTitle = String(r.title || '').toLowerCase();
    const cat = rTitle.includes('anime') ? 'anime' : (r.category || '');
    (r.items || []).forEach(it => addItem({ ...it, _rowTitle: r.title }, cat));
  });
  (state.gaiaflixCatalog?.liveEvents || []).forEach(it => addItem(it, 'gaiaflix'));
  (state.gaiaflixCatalog?.upcomingEvents || []).forEach(it => addItem(it, 'gaiaflix'));
  (state.gaiaflixCatalog?.channels || []).forEach(it => addItem(it, 'gaiaflix'));
  return Array.from(map.values());
}

function minimizeWatchIfPlaying() {
  const watchEl = document.getElementById('watchView');
  const video = document.getElementById('mainVideo');
  if (watchEl && !watchEl.classList.contains('hidden')) {
    watchEl.classList.add('hidden');
    if (video && !video.paused && state.currentItem) {
      const mini = document.getElementById('miniPlayerBar');
      if (mini) {
        mini.classList.remove('hidden');
        document.getElementById('miniPlayerImg').src = state.currentItem.backdrop || state.currentItem.poster || '';
        document.getElementById('miniPlayerTitle').textContent = state.currentItem.cleanTitle || state.currentItem.title;
        document.getElementById('miniPlayerSub').textContent = `${state.currentItem.quality || '1080p'} • Playing`;
      }
    }
  }
}

function showHomeBrowseView() {
  minimizeWatchIfPlaying();
  state.activeDedicatedPage = null;
  state.activeDedicatedTitle = null;
  document.getElementById('dedicatedPageView')?.classList.add('hidden');
  document.getElementById('browseView')?.classList.remove('hidden');
  document.getElementById('filterChipsBar')?.classList.remove('hidden');

  document.querySelectorAll('.rail-item[data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === 'home');
  });
  document.querySelectorAll('.dock-tab[data-dock]').forEach(d => {
    d.classList.toggle('active', d.dataset.dock === 'home');
  });
  document.querySelectorAll('.yt-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.chip === 'all');
  });

  if (state.mbRows && state.mbRows.length > 0) {
    renderAllDynamicMovieBoxRows(state.mbRows);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const DEDICATED_PAGES_CONFIG = {
  bollywood: {
    tag: 'BOLLYWOOD & DUAL AUDIO 4K',
    badge: 'DUAL AUDIO',
    subtag: 'HDHUB4U + VEGAMOVIES + MOVIES4U + BOLLY4U',
    title: 'Bollywood, Hindi & Dual Audio 4K Hits',
    desc: 'Stream complete high-bitrate Bollywood blockbusters, Hindi web series, and dual audio 4K cinema from HDHub4u, Vegamovies, and Movies4u.',
    subfilters: [
      { id: 'all', label: 'All Bollywood 4K' },
      { id: 'action', label: 'Action & Thrillers' },
      { id: 'comedy', label: 'Comedy' },
      { id: 'drama', label: 'Drama & Romance' },
      { id: 'toprated', label: 'Top Rated (8.0+)' }
    ]
  },
  netmirror: {
    tag: 'BOLLYWOOD & DUAL AUDIO 4K',
    badge: 'DUAL AUDIO',
    subtag: 'HDHUB4U + VEGAMOVIES + MOVIES4U + BOLLY4U',
    title: 'Bollywood, Hindi & Dual Audio 4K Hits',
    desc: 'Stream complete high-bitrate Bollywood blockbusters, Hindi web series, and dual audio 4K cinema from HDHub4u, Vegamovies, and Movies4u.',
    subfilters: [
      { id: 'all', label: 'All Bollywood 4K' },
      { id: 'action', label: 'Action & Thrillers' },
      { id: 'comedy', label: 'Comedy' },
      { id: 'drama', label: 'Drama & Romance' },
      { id: 'toprated', label: 'Top Rated (8.0+)' }
    ]
  },
  movies: {
    tag: 'CINEMA VAULT',
    badge: 'MOVIES 4K',
    subtag: 'HOLLYWOOD, BOLLYWOOD & DUAL AUDIO 4K',
    title: 'Movies — 4K Cinema & Dual Audio Hits',
    desc: 'Stream Hollywood blockbusters, Bollywood releases, South Hindi dubbed, and 4K cinema from HDHub4u, Vegamovies, 123movies, and MovieBox.',
    subfilters: [
      { id: 'all', label: 'All Movies' },
      { id: 'bolly', label: 'Bollywood & Dual Audio' },
      { id: 'holly', label: 'Hollywood 4K' },
      { id: 'action', label: 'Action & Sci-Fi' },
      { id: 'toprated', label: 'Top Rated (8.0+)' }
    ]
  },
  series: {
    tag: 'BINGE VAULT',
    badge: 'SERIES',
    subtag: 'GLOBAL SHOWS, WEB SERIES & ORIGINALS',
    title: 'TV Series, Web Shows & Originals',
    desc: 'Stream complete seasons of global hit shows, originals, Prime, and HBO series from Streamu, 123movies, and MovieBox.',
    subfilters: [
      { id: 'all', label: 'All Series' },
      { id: 'originals', label: 'Global Originals' },
      { id: 'drama', label: 'Drama & Crime' },
      { id: 'scifi', label: 'Sci-Fi & Fantasy' },
      { id: 'toprated', label: 'Top Rated (8.0+)' }
    ]
  },
  anime: {
    tag: 'ANIME VAULT',
    badge: 'ANIME',
    subtag: 'SUBBED & DUBBED FROM ANIWATCH & GOGOANIME',
    title: 'Anime — Series, Shonen & Theatrical Films',
    desc: 'Japanese anime series and movies with dual audio (Japanese/English/Hindi dubs) powered by Aniwatch, Zoro, and Gogoanime.',
    subfilters: [
      { id: 'all', label: 'All Anime' },
      { id: 'series', label: 'Anime Series' },
      { id: 'movies', label: 'Anime Movies' },
      { id: 'toprated', label: 'Top Rated Shonen' }
    ]
  },
  local: {
    tag: 'LOCAL 4K VAULT',
    badge: '4K VAULT',
    subtag: 'DIRECT DISK STORAGE (D:\\HOME THEATER)',
    title: 'Local 4K Library Vault',
    desc: 'Zero-buffering direct playback from your local D:\\Home Theater storage with one-click hardware VLC passthrough.',
    subfilters: [
      { id: 'all', label: 'All Local Files' },
      { id: '4k', label: '4K UHD (2160p)' },
      { id: '1080p', label: '1080p Full HD' },
      { id: 'mkv', label: 'MKV Dolby Atmos' },
      { id: 'mp4', label: 'MP4 Direct' }
    ]
  },
  livetv: {
    tag: 'LIVE BROADCAST & SPORTS',
    badge: 'LIVE TV & SPORTS',
    subtag: '24/7 CABLE, SATELLITE & LIVE SPORTS RELAY',
    title: 'Live TV Channels & Live Sports Feeds',
    desc: 'Stream 300+ live satellite & cable television channels, real-time cricket, football, F1, UFC, and global news feeds.',
    subfilters: [
      { id: 'all', label: 'All Live Feeds & Channels' },
      { id: 'sports', label: 'Live Sports' },
      { id: 'cricket', label: 'Cricket Channels' },
      { id: 'football', label: 'Football & Soccer' },
      { id: 'news', label: 'News & World' },
      { id: 'entertainment', label: 'Movies & Entertainment' }
    ]
  },
  gaiaflix: {
    tag: 'LIVE BROADCAST & SPORTS',
    badge: 'LIVE TV & SPORTS',
    subtag: '24/7 CABLE, SATELLITE & LIVE SPORTS RELAY',
    title: 'Live TV Channels & Live Sports Feeds',
    desc: 'Stream 300+ live satellite & cable television channels, real-time cricket, football, F1, UFC, and global news feeds.',
    subfilters: [
      { id: 'all', label: 'All Live Feeds & Channels' },
      { id: 'sports', label: 'Live Sports' },
      { id: 'cricket', label: 'Cricket Channels' },
      { id: 'football', label: 'Football & Soccer' },
      { id: 'news', label: 'News & World' },
      { id: 'entertainment', label: 'Movies & Entertainment' }
    ]
  },
  mylist: {
    tag: 'PERSONAL LIBRARY',
    badge: 'WATCHLIST',
    subtag: 'SAVED TITLES & CONTINUE WATCHING',
    title: 'My Watchlist & Watch History',
    desc: 'Your bookmarked movies, series, and recently watched streams with saved playback positions.',
    subfilters: [
      { id: 'all', label: 'All Saved & History' },
      { id: 'watchlist', label: 'My Watchlist' },
      { id: 'history', label: 'Continue Watching' }
    ]
  },
  continue: {
    tag: 'CONTINUE WATCHING',
    badge: 'RESUME',
    subtag: 'RECENT PLAYBACK SESSIONS',
    title: 'Continue Watching & Watchlist',
    desc: 'Pick up right where you left off across devices or in VLC Media Player.',
    subfilters: [
      { id: 'all', label: 'All History & Saved' },
      { id: 'history', label: 'Continue Watching' },
      { id: 'watchlist', label: 'My Watchlist' }
    ]
  },
  search: {
    tag: 'SEARCH STUDIO',
    badge: 'EXPLORE',
    subtag: 'MOVIEBOX + HDHUB4U + VEGAMOVIES + 123MOVIES + LOCAL',
    title: 'Search & Explore All Catalogs',
    desc: 'Search across MovieBox CDN, HDHub4u, Vegamovies, 123movies, and your Local 4K Vault simultaneously.',
    subfilters: [
      { id: 'all', label: 'All Sources' },
      { id: 'q:Spider-Man', label: 'Spider-Man' },
      { id: 'q:Avengers', label: 'Avengers' },
      { id: 'q:Stranger Things', label: 'Stranger Things' },
      { id: 'q:Breaking Bad', label: 'Breaking Bad' },
      { id: 'q:Interstellar', label: 'Interstellar' },
      { id: 'q:One Piece', label: 'One Piece' }
    ]
  },
  downloads: {
    tag: 'TRANSFER STUDIO',
    badge: 'DOWNLOADS',
    subtag: 'REAL-TIME DOWNLOADS & LOCAL VAULT',
    title: 'Downloads & Offline Media Manager',
    desc: 'Manage active downloads, monitor transfer speeds, download from direct stream URLs, and play offline files.',
    subfilters: [
      { id: 'all', label: 'All Downloads & Vault' },
      { id: 'local', label: 'Downloaded Local Files' }
    ]
  },
  top10: {
    tag: 'TRENDING CHARTS',
    badge: 'TOP 10',
    subtag: 'MOST WATCHED TODAY',
    title: 'Top 10 Trending Movies & Series Today',
    desc: 'The most streamed movies and series across all entertainment providers today.',
    subfilters: [
      { id: 'all', label: 'All Top Trending' },
      { id: 'movies', label: 'Top 10 Movies' },
      { id: 'series', label: 'Top 10 Series' }
    ]
  },
  atmos: {
    tag: 'UHD HDR & ATMOS',
    badge: '4K & ATMOS',
    subtag: 'HIGH BITRATE CINEMA',
    title: '4K UHD & Dolby Atmos Cinema',
    desc: 'High-bitrate 2160p 4K UHD and 1080p HEVC streams with Dolby Atmos 5.1 and Spatial Audio.',
    subfilters: [
      { id: 'all', label: 'All 4K & Atmos' },
      { id: 'local', label: 'Local 4K Vault' },
      { id: 'movies', label: '1080p HEVC Cinema' }
    ]
  },
  'Sci-Fi': {
    tag: 'GENRE SPOTLIGHT',
    badge: 'SCI-FI & ACTION',
    subtag: 'BLOCKBUSTER UNIVERSE',
    title: 'Sci-Fi, Action & Superhero Blockbusters',
    desc: 'Futuristic adventures, superhero blockbusters, and high-octane action movies & series.',
    subfilters: [
      { id: 'all', label: 'All Sci-Fi & Action' },
      { id: 'movies', label: 'Movies' },
      { id: 'series', label: 'Series' }
    ]
  },
  Action: {
    tag: 'GENRE SPOTLIGHT',
    badge: 'ACTION',
    subtag: 'HIGH-OCTANE CINEMA',
    title: 'Action, Thriller & Adventure',
    desc: 'Blockbuster action films, espionage thrillers, and adventure series.',
    subfilters: [
      { id: 'all', label: 'All Action' },
      { id: 'movies', label: 'Action Movies' },
      { id: 'series', label: 'Action Series' }
    ]
  }
};

async function openDedicatedPage(pageKey, customSearchQuery = '') {
  if (!pageKey || pageKey === 'home' || pageKey === 'all') {
    showHomeBrowseView();
    return;
  }

  minimizeWatchIfPlaying();

  const cfg = DEDICATED_PAGES_CONFIG[pageKey] || {
    tag: 'CATALOG HUB',
    badge: 'FEATURED',
    subtag: String(pageKey).toUpperCase(),
    title: `${String(pageKey).charAt(0).toUpperCase() + String(pageKey).slice(1)} Collection`,
    desc: 'Explore full-resolution streams, multi-audio tracks, and direct downloads.',
    subfilters: [{ id: 'all', label: 'All Titles' }]
  };

  state.activeDedicatedPage = pageKey;
  state.activeDedicatedTitle = cfg.title.split('—')[0].trim();
  state.activeDedicatedSubfilter = 'all';

  document.getElementById('browseView')?.classList.add('hidden');
  document.getElementById('watchView')?.classList.add('hidden');
  document.getElementById('dedicatedPageView')?.classList.remove('hidden');

  // Highlight matching sidebar item & filter chip & mobile dock tab
  document.querySelectorAll('.rail-item[data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === pageKey);
  });
  document.querySelectorAll('.dock-tab[data-dock]').forEach(d => {
    d.classList.toggle('active', d.dataset.dock === pageKey);
  });
  document.querySelectorAll('.yt-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.chip === pageKey);
  });

  document.getElementById('dedicatedPageTag').textContent = cfg.tag;
  document.getElementById('dedicatedHeroBadge').textContent = cfg.badge;
  document.getElementById('dedicatedHeroSubtag').textContent = cfg.subtag;
  document.getElementById('dedicatedPageTitle').textContent = cfg.title;
  document.getElementById('dedicatedPageDesc').textContent = cfg.desc;

  const filterInput = document.getElementById('dedicatedFilterInput');
  if (filterInput) {
    filterInput.value = customSearchQuery || '';
    filterInput.placeholder = pageKey === 'search'
      ? 'Type any movie, series, anime, or actor to search...'
      : `Filter ${cfg.title.split('—')[0].trim()}...`;
  }

  // Render Page-Specific Action Buttons in Topbar
  const actionsEl = document.getElementById('dedicatedPageActions');
  if (actionsEl) {
    actionsEl.innerHTML = '';
    if (pageKey === 'local' || pageKey === 'downloads') {
      const rescanBtn = document.createElement('button');
      rescanBtn.className = 'row-action-btn';
      rescanBtn.textContent = 'Rescan Vault';
      rescanBtn.onclick = async () => {
        await loadBackendState();
        renderDedicatedPageContent(pageKey);
        showToast('Rescanned D:\\Home Theater vault');
      };
      const openDirBtn = document.createElement('button');
      openDirBtn.className = 'row-action-btn';
      openDirBtn.textContent = 'Open Windows Explorer';
      openDirBtn.onclick = async () => {
        await fetch('/api/open-folder', { method: 'POST' });
        showToast('Opened D:\\Home Theater in Windows Explorer');
      };
      actionsEl.appendChild(rescanBtn);
      actionsEl.appendChild(openDirBtn);
    }
    if (pageKey === 'downloads') {
      const openModalBtn = document.createElement('button');
      openModalBtn.className = 'row-action-btn';
      openModalBtn.textContent = 'Direct URL Transfer';
      openModalBtn.onclick = openDownloadsModal;
      actionsEl.appendChild(openModalBtn);
    }
    if (pageKey === 'livetv' || pageKey === 'gaiaflix') {
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'row-action-btn';
      refreshBtn.textContent = 'Refresh Live Feeds';
      refreshBtn.onclick = () => fetchGaiaFlixCatalog(true);
      actionsEl.appendChild(refreshBtn);

      const addStreamBtn = document.createElement('button');
      addStreamBtn.className = 'row-action-btn';
      addStreamBtn.textContent = '+ Add Custom M3U8 Stream';
      addStreamBtn.onclick = () => document.getElementById('settingsModal')?.classList.remove('hidden');
      actionsEl.appendChild(addStreamBtn);
    }
    if (pageKey === 'mylist' || pageKey === 'continue') {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'row-action-btn';
      clearBtn.textContent = 'Clear Watchlist';
      clearBtn.onclick = () => {
        state.uiData.watchlist = [];
        renderDedicatedPageContent(pageKey);
        showToast('Cleared Watchlist');
      };
      actionsEl.appendChild(clearBtn);
    }
  }

  // Render Subfilter Pills
  const subfiltersEl = document.getElementById('dedicatedSubfilters');
  if (subfiltersEl) {
    subfiltersEl.innerHTML = '';
    (cfg.subfilters || []).forEach((sf, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dedicated-subpill ${idx === 0 ? 'active' : ''}`;
      btn.textContent = sf.label;
      btn.onclick = async () => {
        subfiltersEl.querySelectorAll('.dedicated-subpill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        state.activeDedicatedSubfilter = sf.id;
        if (sf.id.startsWith('q:')) {
          const qText = sf.id.slice(2);
          if (filterInput) filterInput.value = qText;
          await runDedicatedLiveSearch(qText);
        } else {
          renderDedicatedPageContent(pageKey);
        }
      };
      subfiltersEl.appendChild(btn);
    });
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (pageKey === 'search' && customSearchQuery) {
    await runDedicatedLiveSearch(customSearchQuery);
    return;
  }

  // If Anime page has very few items, enrich from live search
  if (pageKey === 'anime' && (!state.animeCatalog || state.animeCatalog.length < 8)) {
    renderDedicatedPageContent(pageKey);
    try {
      const res = await fetch('/api/search?q=anime');
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        state.animeCatalog = [...(state.animeCatalog || []), ...data.results];
        if (state.activeDedicatedPage === 'anime') renderDedicatedPageContent('anime');
      }
    } catch {}
    return;
  }

  // If Bollywood page has no items loaded yet, fetch directly from /api/netmirror/catalog
  if ((pageKey === 'bollywood' || pageKey === 'netmirror') && (!state.bollywoodCatalog || state.bollywoodCatalog.length === 0)) {
    renderDedicatedPageContent(pageKey);
    await fetchBollywoodCatalog();
    if (state.activeDedicatedPage === 'bollywood' || state.activeDedicatedPage === 'netmirror') renderDedicatedPageContent(state.activeDedicatedPage);
    return;
  }

  renderDedicatedPageContent(pageKey);
}

async function runDedicatedLiveSearch(query) {
  const grid = document.getElementById('dedicatedPageGrid');
  const countEl = document.getElementById('dedicatedPageCount');
  if (!grid) return;

  grid.classList.remove('wide-grid');
  grid.innerHTML = `<div class="dedicated-empty-box">Searching MovieBox CDN, HDHub4u, Vegamovies, 123movies &amp; Local Vault for "${query}"...</div>`;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = data.results || [];
    state.lastSearchResults = results;
    if (countEl) countEl.textContent = `${results.length} Results`;

    if (results.length > 0) {
      updateDedicatedHeroBanner(results[0]);
      grid.innerHTML = '';
      results.forEach(item => grid.appendChild(buildPosterCard(item)));
    } else {
      grid.innerHTML = `<div class="dedicated-empty-box">No titles matched "${query}". Try another search keyword.</div>`;
    }
  } catch (err) {
    grid.innerHTML = `<div class="dedicated-empty-box">Search error: ${err.message}</div>`;
  }
}

function updateDedicatedHeroBanner(featuredItem) {
  const heroBox = document.getElementById('dedicatedPageHero');
  if (!heroBox || !featuredItem) return;

  const imgEl = document.getElementById('dedicatedHeroImg');
  if (imgEl) imgEl.src = featuredItem.backdrop || featuredItem.poster || 'https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=1920&q=85';

  const playBtn = document.getElementById('dedicatedHeroPlayBtn');
  const vlcBtn = document.getElementById('dedicatedHeroVlcBtn');
  const dlBtn = document.getElementById('dedicatedHeroDlBtn');
  const infoBtn = document.getElementById('dedicatedHeroInfoBtn');

  if (playBtn) {
    playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Play ${featuredItem.cleanTitle || featuredItem.title}</span>`;
    playBtn.onclick = () => openTheaterPlayer(featuredItem);
  }
  if (vlcBtn) vlcBtn.onclick = () => launchInVlc(featuredItem);
  if (dlBtn) dlBtn.onclick = () => startDownload(featuredItem);
  if (infoBtn) infoBtn.onclick = () => openDetailsModal(featuredItem);
}

function renderDedicatedPageContent(pageKey) {
  const grid = document.getElementById('dedicatedPageGrid');
  const extraBox = document.getElementById('dedicatedExtraContainer');
  const countEl = document.getElementById('dedicatedPageCount');
  if (!grid) return;

  grid.innerHTML = '';
  grid.classList.remove('wide-grid');
  if (extraBox) {
    extraBox.classList.add('hidden');
    extraBox.innerHTML = '';
  }

  const sub = state.activeDedicatedSubfilter || 'all';
  const filterText = (document.getElementById('dedicatedFilterInput')?.value || '').trim().toLowerCase();
  const sortMode = document.getElementById('dedicatedSortSelect')?.value || 'featured';
  const allItems = collectAllCatalogItems();

  // Special Case A: Live TV & Sports Dedicated Page (All 300+ Sports & Satellite Channels)
  if (pageKey === 'livetv' || pageKey === 'gaiaflix') {
    grid.classList.add('wide-grid');
    const live = state.gaiaflixCatalog?.liveEvents || [];
    const upcoming = state.gaiaflixCatalog?.upcomingEvents || [];
    const channels = state.gaiaflixCatalog?.channels || [];
    const custom = (state.uiData.customIptv || []).map(ch => ({
      id: ch.id,
      title: ch.name,
      cleanTitle: ch.name,
      year: 'LIVE NOW',
      rating: 'LIVE',
      quality: ch.quality || '1080p60 LIVE',
      genreKey: String(ch.category || '').toLowerCase(),
      category: ch.category || 'Television',
      provider: 'Live Relay',
      poster: ch.logo,
      backdrop: ch.logo,
      streamUrl: ch.streamUrl,
      isLive: true,
      badge: '24/7 LIVE'
    }));

    let pool = [];
    if (sub === 'sports') {
      pool = [
        ...live.filter(it => /sport/i.test(it.category || '') || it.genreKey === 'sports'),
        ...channels.filter(c => c.genreKey === 'sports' || /sport/i.test(c.category || '')),
        ...custom.filter(c => /sport/i.test(c.genreKey || ''))
      ];
    } else if (sub === 'cricket') {
      pool = [
        ...live.filter(it => /cricket/i.test(it.title || '') || /cricket/i.test(it.category || '')),
        ...channels.filter(c => /cricket/i.test(c.name || '') || /cricket/i.test(c.category || '') || /cricket/i.test(c.id || '')),
        ...custom.filter(c => /cricket/i.test(c.title || '') || /cricket/i.test(c.category || ''))
      ];
    } else if (sub === 'football') {
      pool = [
        ...live.filter(it => /football|soccer/i.test(it.title || '') || /football|soccer/i.test(it.category || '')),
        ...channels.filter(c => /football|soccer/i.test(c.name || '') || /football|soccer/i.test(c.category || '')),
        ...custom.filter(c => /football|soccer/i.test(c.title || ''))
      ];
    } else if (sub === 'news') {
      pool = [
        ...channels.filter(c => c.genreKey === 'news' || /news/i.test(c.category || '')),
        ...custom.filter(c => /news/i.test(c.genreKey || ''))
      ];
    } else if (sub === 'entertainment') {
      pool = [
        ...channels.filter(c => c.genreKey === 'entertainment' || c.genreKey === 'movies'),
        ...custom.filter(c => /ent|movie|series/i.test(c.genreKey || ''))
      ];
    } else {
      // 'all': active live matches first, then 24/7 channels & custom IPTV, then upcoming events
      pool = [...live, ...channels, ...custom, ...upcoming];
    }

    if (filterText) {
      pool = pool.filter(it =>
        String(it.name || it.title || it.cleanTitle || '').toLowerCase().includes(filterText) ||
        String(it.category || '').toLowerCase().includes(filterText)
      );
    }

    if (countEl) countEl.textContent = `${pool.length} Live Feeds & Channels`;

    if (pool.length > 0) {
      const topPick = pool.find(it => it.isLive) || pool[0];
      updateDedicatedHeroBanner({
        id: topPick.id,
        title: topPick.cleanTitle || topPick.name || topPick.title,
        cleanTitle: topPick.cleanTitle || topPick.name || topPick.title,
        poster: topPick.poster,
        backdrop: topPick.backdrop,
        quality: topPick.quality || '1080p60 LIVE',
        streamUrl: topPick.streamUrl,
        isLive: true
      });
    }

    if (pool.length === 0) {
      grid.innerHTML = `
        <div class="dedicated-empty-box">
          <strong>No Live Streams Found</strong>
          <p>No streams match your filter. Try switching sub-category pills or clearing the search text.</p>
        </div>
      `;
      return;
    }

    pool.forEach(item => {
      const card = document.createElement('article');
      card.className = 'wide-card';
      card.tabIndex = 0;
      const isLiveMatch = item.badge === 'LIVE MATCH';
      const isUpcoming = item.badge === 'UPCOMING FEED';
      const badgeClass = isLiveMatch ? 'live' : (isUpcoming ? 'upcoming' : 'live');
      const badgeText = item.badge || '24/7 LIVE';

      card.innerHTML = `
        <div class="wide-thumb">
          <img src="${item.poster || item.backdrop}" alt="${item.cleanTitle || item.title || item.name}" loading="lazy" />
          <div class="card-badges-top">
            <span class="pill-badge ${badgeClass}">${badgeText}</span>
            <span class="pill-badge dark">${item.category}</span>
          </div>
          <div class="thumb-play-overlay">
            <div class="play-circle-icon">▶</div>
          </div>
        </div>
        <div class="wide-body">
          <div class="wide-title" title="${item.cleanTitle || item.title || item.name}">${item.cleanTitle || item.title || item.name}</div>
          <div class="wide-meta">
            <span>${item.quality || '1080p60'}</span>
            <span>•</span>
            <span>${item.provider || 'Live Relay'}</span>
          </div>
          <div class="wide-actions">
            <button class="card-btn play" data-action="play">${isUpcoming ? 'Watch Feed' : 'Watch Live'}</button>
            <button class="card-btn vlc" data-action="vlc">Open in VLC</button>
          </div>
        </div>
      `;
      card.querySelector('.wide-thumb').onclick = () => openTheaterPlayer(item);
      card.querySelector('[data-action="play"]').onclick = () => openTheaterPlayer(item);
      card.querySelector('[data-action="vlc"]').onclick = () => launchInVlc(item);
      grid.appendChild(card);
    });
    return;
  }

  // Special Case B: Local 4K Vault or Downloads Dedicated Page
  if (pageKey === 'local' || pageKey === 'downloads') {
    grid.classList.add('wide-grid');
    if (pageKey === 'downloads' && extraBox) {
      extraBox.classList.remove('hidden');
      extraBox.innerHTML = `
        <div class="yt-video-meta-panel" style="margin-bottom:14px">
          <div class="dl-modal-header" style="margin-bottom:12px">
            <div>
              <h3 style="margin:0;font-size:18px">Active &amp; Recent Transfers</h3>
              <p class="settings-sub" style="margin:2px 0 0 0">Real-time transfer speed, progress, and direct stream downloader</p>
            </div>
            <button class="btn-hero-secondary" id="dedicatedOpenDlModalBtn">Open Transfer Controls</button>
          </div>
          <div id="dedicatedDownloadsClone">${document.getElementById('downloadsListContainer')?.innerHTML || ''}</div>
        </div>
      `;
      document.getElementById('dedicatedOpenDlModalBtn')?.addEventListener('click', openDownloadsModal);
    }

    let files = (state.localMedia || []).filter(item => {
      if (sub === '4k' && !String(item.quality || '').includes('4K')) return false;
      if (sub === '1080p' && !String(item.quality || '').includes('1080')) return false;
      if (sub === 'mkv' && String(item.ext || '').toUpperCase() !== 'MKV') return false;
      if (sub === 'mp4' && String(item.ext || '').toUpperCase() !== 'MP4') return false;
      if (filterText && !String(item.title || '').toLowerCase().includes(filterText)) return false;
      return true;
    });

    if (countEl) countEl.textContent = `${files.length} Local Vault File(s)`;
    if (files.length > 0) updateDedicatedHeroBanner(files[0]);

    if (files.length === 0) {
      grid.innerHTML = `<div class="dedicated-empty-box">No local media files matched your filter in D:\\Home Theater.</div>`;
      return;
    }

    files.forEach(item => {
      const card = document.createElement('article');
      card.className = 'wide-card';
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="wide-thumb">
          <img src="${item.backdrop || item.poster}" alt="${item.title}" loading="lazy" />
          <div class="card-badges-top">
            <span class="pill-badge gold">${item.quality}</span>
            <span class="pill-badge atmos">${item.ext || 'MKV'} • ${item.sizeFormatted}</span>
          </div>
          <div class="thumb-play-overlay">
            <div class="play-circle-icon">▶</div>
          </div>
        </div>
        <div class="wide-body">
          <div class="wide-title">${item.cleanTitle || item.title}</div>
          <div class="wide-meta"><span>${item.year || '2026'}</span><span>•</span><span>${item.sizeFormatted}</span></div>
          <div class="wide-actions">
            <button class="card-btn play" data-action="play">Play</button>
            <button class="card-btn vlc" data-action="vlc">Open in VLC</button>
            <button class="card-btn ghost" data-action="info">Details</button>
          </div>
        </div>
      `;
      card.querySelector('.wide-thumb').onclick = () => openTheaterPlayer(item);
      card.querySelector('[data-action="play"]').onclick = () => openTheaterPlayer(item);
      card.querySelector('[data-action="vlc"]').onclick = () => launchInVlc(item);
      card.querySelector('[data-action="info"]').onclick = () => openDetailsModal(item);
      grid.appendChild(card);
    });
    return;
  }

  // Standard Poster Grid Dedicated Pages (NetMirror, Movies, Series, Anime, Watchlist, Top 10, Atmos, Sci-Fi, Search)
  let filtered = [];

  if (pageKey === 'bollywood' || pageKey === 'netmirror') {
    filtered = (state.bollywoodCatalog && state.bollywoodCatalog.length > 0)
      ? [...state.bollywoodCatalog]
      : allItems.filter(it => it.provider?.includes('HDHub4u') || it.provider?.includes('Vegamovies') || it.provider?.includes('Dual Audio') || /bollywood|hindi|dual/i.test(it._rowTitle || ''));
    if (sub === 'action') filtered = filtered.filter(it => (it.genres || []).some(g => /action|thriller/i.test(g)));
    if (sub === 'comedy') filtered = filtered.filter(it => (it.genres || []).some(g => /comedy/i.test(g)));
    if (sub === 'drama') filtered = filtered.filter(it => (it.genres || []).some(g => /drama|romance/i.test(g)));
    if (sub === 'toprated') filtered = filtered.filter(it => parseFloat(it.rating || '8.2') >= 8.0);
  } else if (pageKey === 'movies') {
    filtered = allItems.filter(it => it.type !== 'series' && Number(it.stype) !== 2);
    if (sub === 'action') filtered = filtered.filter(it => (it.genres || []).some(g => /action|adventure/i.test(g)) || /action|hollywood/i.test(it._rowTitle || ''));
    if (sub === 'scifi') filtered = filtered.filter(it => (it.genres || []).some(g => /sci-fi|fantasy/i.test(g)));
    if (sub === 'thriller') filtered = filtered.filter(it => (it.genres || []).some(g => /thriller|crime|mystery|horror/i.test(g)));
    if (sub === 'drama') filtered = filtered.filter(it => (it.genres || []).some(g => /drama|romance/i.test(g)));
    if (sub === 'toprated') filtered = filtered.filter(it => parseFloat(it.rating || '8.2') >= 8.0);
  } else if (pageKey === 'series') {
    filtered = allItems.filter(it => it.type === 'series' || Number(it.stype) === 2 || it._rowCategory === 'series');
    if (sub === 'western') filtered = filtered.filter(it => /western|hollywood|english/i.test(it._rowTitle || '') || !/k-drama|korean/i.test(it._rowTitle || ''));
    if (sub === 'asian') filtered = filtered.filter(it => /k-drama|korean|asian|cdrama/i.test(it._rowTitle || ''));
    if (sub === 'crime') filtered = filtered.filter(it => (it.genres || []).some(g => /crime|thriller|mystery|drama/i.test(g)));
    if (sub === 'toprated') filtered = filtered.filter(it => parseFloat(it.rating || '8.2') >= 8.0);
  } else if (pageKey === 'anime') {
    filtered = allItems.filter(it =>
      it._rowCategory === 'anime' ||
      /anime|animation/i.test(it._rowTitle || '') ||
      (it.genres || []).some(g => /anime|animation/i.test(g)) ||
      (state.animeCatalog || []).includes(it)
    );
    if (sub === 'series') filtered = filtered.filter(it => it.type === 'series' || Number(it.stype) === 2);
    if (sub === 'movies') filtered = filtered.filter(it => it.type !== 'series' && Number(it.stype) !== 2);
    if (sub === 'toprated') filtered = filtered.filter(it => parseFloat(it.rating || '8.2') >= 8.0);
  } else if (pageKey === 'mylist' || pageKey === 'continue') {
    const watchIds = new Set((state.uiData.watchlist || []).map(String));
    const watchlistItems = allItems.filter(it => watchIds.has(String(it.id)) || watchIds.has(String(it.subjectId)));
    const historyItems = (state.tuiHistory?.recent || []).map(r => ({
      id: `mb_${r.subject_id}`,
      subjectId: String(r.subject_id),
      title: r.title,
      cleanTitle: String(r.title || '').replace(/\s*\[[^\]]+\]\s*/g, '').trim() || r.title,
      year: r.release_year || '2026',
      type: Number(r.stype) === 2 ? 'series' : 'movie',
      stype: r.stype || 1,
      season: r.season || 0,
      episode: r.episode || 0,
      poster: r.cover_url || '',
      backdrop: r.cover_url || '',
      quality: '1080p Full HD',
      rating: '8.5',
      progressSeconds: Number(r.progress_seconds || 0)
    }));
    if (sub === 'watchlist') filtered = watchlistItems;
    else if (sub === 'history') filtered = historyItems;
    else {
      const combinedMap = new Map();
      [...watchlistItems, ...historyItems].forEach(it => combinedMap.set(String(it.id || it.title), it));
      filtered = Array.from(combinedMap.values());
    }
  } else if (pageKey === 'top10') {
    if (sub === 'movies') filtered = [...state.top10Movies];
    else if (sub === 'series') filtered = [...state.top10Series];
    else filtered = [...state.top10Movies, ...state.top10Series];
  } else if (pageKey === 'atmos') {
    if (sub === 'local') filtered = [...state.localMedia];
    else filtered = [...state.localMedia, ...state.top10Movies, ...state.top10Series];
  } else if (pageKey === 'Sci-Fi' || pageKey === 'Action') {
    filtered = allItems.filter(it =>
      (it.genres || []).some(g => /sci-fi|action|adventure|fantasy|thriller/i.test(g)) ||
      /action|sci-fi|hollywood|western|trending/i.test(it._rowTitle || '')
    );
    if (filtered.length < 6) filtered = allItems;
    if (sub === 'movies') filtered = filtered.filter(it => it.type !== 'series' && Number(it.stype) !== 2);
    if (sub === 'series') filtered = filtered.filter(it => it.type === 'series' || Number(it.stype) === 2);
  } else if (pageKey === 'search') {
    filtered = (state.lastSearchResults && state.lastSearchResults.length > 0)
      ? state.lastSearchResults
      : allItems;
  } else {
    filtered = allItems;
  }

  if (filterText && pageKey !== 'search') {
    filtered = filtered.filter(it =>
      String(it.title || '').toLowerCase().includes(filterText) ||
      String(it.cleanTitle || '').toLowerCase().includes(filterText) ||
      (it.genres || []).some(g => String(g).toLowerCase().includes(filterText))
    );
  }

  if (sortMode === 'rating') {
    filtered.sort((a, b) => parseFloat(b.rating || '8.0') - parseFloat(a.rating || '8.0'));
  } else if (sortMode === 'year') {
    filtered.sort((a, b) => parseInt(b.year || '2025', 10) - parseInt(a.year || '2025', 10));
  } else if (sortMode === 'title') {
    filtered.sort((a, b) => String(a.cleanTitle || a.title).localeCompare(String(b.cleanTitle || b.title)));
  }

  if (countEl) countEl.textContent = `${filtered.length} Titles`;
  if (filtered.length > 0) {
    updateDedicatedHeroBanner(filtered[0]);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="dedicated-empty-box">No titles found on this page yet. Add titles to your Watchlist or try another filter.</div>`;
    return;
  }

  filtered.forEach(item => {
    grid.appendChild(buildPosterCard(item));
  });
}

function applySectionFilter(filterKey) {
  if (!filterKey || filterKey === 'all' || filterKey === 'home') {
    showHomeBrowseView();
    return;
  }
  openDedicatedPage(filterKey);
}

// =========================================================================
// 8. REAL-TIME DOWNLOAD MANAGER (SPEED MB/s, PROGRESS %, ETA & CONTROLS)
// =========================================================================
function formatBytes(bytes) {
  const b = Number(bytes || 0);
  if (b <= 0) return '0 B';
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

function formatSpeed(bytesPerSec) {
  const s = Number(bytesPerSec || 0);
  if (s <= 0) return '0 KB/s';
  if (s >= 1024 * 1024) return `${(s / (1024 * 1024)).toFixed(2)} MB/s`;
  return `${Math.max(1, Math.round(s / 1024))} KB/s`;
}

function formatEta(sec) {
  if (sec === null || sec === undefined || sec <= 0 || !isFinite(sec)) return 'Calculating...';
  const s = Math.round(sec);
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s left`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m left`;
}

const dlConfigState = {
  item: null,
  explicitStream: null,
  subjectId: null,
  selectedLanguage: 'Original',
  selectedAudioType: 'AAC 2.0 Stereo',
  dubs: [],
  seasons: [],
  se: 0,
  ep: 0,
  qualityOptions: [],
  selectedQualityObj: null,
  targetFolder: localStorage.getItem('mb_dl_folder') || 'D:\\Home Theater\\Downloads'
};

function openDownloadsModal() {
  document.getElementById('downloadsModal').classList.remove('hidden');
  refreshDownloadsUI();
}

async function startDownload(item, explicitStreamObj = null) {
  if (!item) return;
  await openDownloadConfigModal(item, explicitStreamObj);
}

async function openDownloadConfigModal(item, explicitStreamObj = null) {
  const modal = document.getElementById('downloadConfigModal');
  if (!modal) return;

  const rawSubjectId = item.subjectId || (String(item.id || '').startsWith('mb_') ? String(item.id).replace(/^mb_/, '') : null);
  const isSeries = item.type === 'series' || Number(item.stype) === 2 || Number(item.season) > 0;
  const se = isSeries ? Number(item.season || 1) : 0;
  const ep = isSeries ? Number(item.episode || 1) : 0;

  dlConfigState.item = item;
  dlConfigState.explicitStream = explicitStreamObj;
  dlConfigState.subjectId = rawSubjectId;
  dlConfigState.selectedLanguage = 'Original Audio';
  dlConfigState.selectedAudioType = 'AAC 2.0 Stereo';
  dlConfigState.dubs = [];
  dlConfigState.seasons = [];
  dlConfigState.se = se;
  dlConfigState.ep = ep;
  dlConfigState.qualityOptions = [];
  dlConfigState.selectedQualityObj = null;

  document.querySelectorAll('#dlCfgAudioTypePills .dl-cfg-pill').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === 0);
  });

  const folderInput = document.getElementById('dlCfgFolderInput');
  if (folderInput) {
    const savedFolder = localStorage.getItem('mb_dl_folder');
    if (savedFolder) {
      folderInput.value = savedFolder;
      dlConfigState.targetFolder = savedFolder;
    } else {
      const defaultDir = 'D:\\Home Theater\\Downloads';
      folderInput.value = defaultDir;
      dlConfigState.targetFolder = defaultDir;
    }
    syncFolderPresetActive(folderInput.value);
  }

  document.getElementById('dlCfgPoster').src = item.poster || item.backdrop || '';
  document.getElementById('dlCfgTitle').textContent = item.cleanTitle || item.title || 'Media Download';
  document.getElementById('dlCfgMeta').textContent = `${item.year || '2026'} • ${item.provider || 'MovieBox CDN'} • ${isSeries ? `Season ${se} Episode ${ep}` : 'Feature Film'}`;
  document.getElementById('dlCfgStatusLine').textContent = rawSubjectId
    ? 'Fetching available audio tracks and exact resolution file sizes...'
    : 'Direct stream ready for download configuration';

  const epSection = document.getElementById('dlCfgEpisodeSection');
  if (epSection) epSection.classList.add('hidden');

  renderDlConfigLanguagePills([
    { subjectId: rawSubjectId, lanName: 'Original Audio', cleanLang: 'Original Audio', lanCode: 'orig', original: true }
  ]);

  const fallbackBaseSize = Number(item.sizeBytes) || (isSeries ? 420 * 1024 * 1024 : 1120 * 1024 * 1024);
  renderDlConfigQualities([
    {
      id: 'q_1080',
      resolution: '1080p',
      quality: '1080p Full HD',
      repId: '0',
      codec: 'HEVC',
      sizeBytes: fallbackBaseSize,
      sizeFormatted: formatBytes(fallbackBaseSize),
      streamUrl: explicitStreamObj?.streamUrl || item.streamUrl || null
    },
    {
      id: 'q_720',
      resolution: '720p',
      quality: '720p HD',
      repId: '1',
      codec: 'HEVC',
      sizeBytes: Math.round(fallbackBaseSize * 0.54),
      sizeFormatted: formatBytes(Math.round(fallbackBaseSize * 0.54)),
      streamUrl: explicitStreamObj?.streamUrl || item.streamUrl || null
    },
    {
      id: 'q_480',
      resolution: '480p',
      quality: '480p SD',
      repId: '2',
      codec: 'HEVC',
      sizeBytes: Math.round(fallbackBaseSize * 0.32),
      sizeFormatted: formatBytes(Math.round(fallbackBaseSize * 0.32)),
      streamUrl: explicitStreamObj?.streamUrl || item.streamUrl || null
    }
  ]);

  modal.classList.remove('hidden');

  if (!rawSubjectId) return;

  try {
    const detRes = await fetch(`/api/moviebox/details?subjectId=${encodeURIComponent(rawSubjectId)}`);
    const detData = await detRes.json();
    const details = detData?.details;

    if (details) {
      if (Number(details.stype) === 1) {
        dlConfigState.se = 0;
        dlConfigState.ep = 0;
      } else if (Number(details.stype) === 2 && dlConfigState.se === 0) {
        dlConfigState.se = 1;
        dlConfigState.ep = 1;
      }

      if (Array.isArray(details.dubs) && details.dubs.length > 0) {
        const mappedDubs = details.dubs.map(d => ({
          subjectId: String(d.subjectId),
          lanName: d.lanName,
          cleanLang: String(d.lanName || 'Original').replace(/\s*\(Original\)/i, '').trim(),
          lanCode: d.lanCode || 'en',
          original: Boolean(d.original)
        }));
        dlConfigState.dubs = mappedDubs;
        const activeDub = mappedDubs.find(d => String(d.subjectId) === String(rawSubjectId)) || mappedDubs[0];
        dlConfigState.subjectId = activeDub.subjectId;
        dlConfigState.selectedLanguage = activeDub.cleanLang;
        renderDlConfigLanguagePills(mappedDubs);
      }

      if (Array.isArray(details.seasons) && details.seasons.length > 0) {
        dlConfigState.seasons = details.seasons;
        if (dlConfigState.se === 0) dlConfigState.se = details.seasons[0].season || 1;
        if (dlConfigState.ep === 0) dlConfigState.ep = 1;
        renderDlConfigSeasonEpisode(details.seasons, dlConfigState.se, dlConfigState.ep);
      }
    }

    await refreshDlConfigStreams();
  } catch (err) {
    document.getElementById('dlCfgStatusLine').textContent = 'Ready to download';
  }
}

function renderDlConfigLanguagePills(dubList) {
  const container = document.getElementById('dlCfgLanguagePills');
  if (!container) return;
  container.innerHTML = '';

  dubList.forEach((d, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const langLabel = d.cleanLang || String(d.lanName || 'Original').replace(/\s*\(Original\)/i, '').trim();
    const isActive = (d.subjectId && String(d.subjectId) === String(dlConfigState.subjectId))
      || (idx === 0 && !dlConfigState.subjectId);
    btn.className = `dl-cfg-pill ${isActive ? 'active' : ''}`;
    btn.textContent = d.lanName;
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.dl-cfg-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      dlConfigState.selectedLanguage = langLabel;
      if (d.subjectId && String(d.subjectId) !== String(dlConfigState.subjectId)) {
        dlConfigState.subjectId = String(d.subjectId);
        await refreshDlConfigStreams();
      } else {
        updateDlConfigConfirmButton();
      }
    });
    container.appendChild(btn);
  });
}

function renderDlConfigSeasonEpisode(seasons, activeSe, activeEp) {
  const sec = document.getElementById('dlCfgEpisodeSection');
  const seSelect = document.getElementById('dlCfgSeasonSelect');
  const epSelect = document.getElementById('dlCfgEpisodeSelect');
  if (!sec || !seSelect || !epSelect) return;

  sec.classList.remove('hidden');
  seSelect.innerHTML = '';

  seasons.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.season;
    opt.textContent = `Season ${s.season} (${s.maxEp} Episodes)`;
    if (Number(s.season) === Number(activeSe)) opt.selected = true;
    seSelect.appendChild(opt);
  });

  const populateEps = (seasonNum, selectedEp) => {
    epSelect.innerHTML = '';
    const sObj = seasons.find(s => Number(s.season) === Number(seasonNum)) || seasons[0];
    const maxEp = Math.min(sObj?.maxEp || 1, 100);
    for (let e = 1; e <= maxEp; e++) {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = `Episode ${e}`;
      if (e === Number(selectedEp)) opt.selected = true;
      epSelect.appendChild(opt);
    }
  };

  populateEps(activeSe, activeEp);

  seSelect.onchange = async () => {
    dlConfigState.se = Number(seSelect.value);
    dlConfigState.ep = 1;
    populateEps(dlConfigState.se, 1);
    await refreshDlConfigStreams();
  };

  epSelect.onchange = async () => {
    dlConfigState.ep = Number(epSelect.value);
    await refreshDlConfigStreams();
  };
}

async function refreshDlConfigStreams() {
  if (!dlConfigState.subjectId) return;
  const statusEl = document.getElementById('dlCfgStatusLine');
  if (statusEl) statusEl.textContent = 'Calculating exact stream sizes from MovieBox CDN...';

  try {
    const res = await fetch(
      `/api/moviebox/streams?subjectId=${encodeURIComponent(dlConfigState.subjectId)}&se=${dlConfigState.se}&ep=${dlConfigState.ep}`
    );
    const data = await res.json();
    if (data.ok && Array.isArray(data.qualityOptions) && data.qualityOptions.length > 0) {
      renderDlConfigQualities(data.qualityOptions);
      if (statusEl) {
        const epTag = dlConfigState.se > 0 ? ` • S${String(dlConfigState.se).padStart(2, '0')}E${String(dlConfigState.ep).padStart(2, '0')}` : '';
        statusEl.textContent = `Verified ${data.qualityOptions.length} resolutions (${dlConfigState.selectedLanguage} • ${dlConfigState.selectedAudioType}${epTag})`;
      }
    } else if (statusEl) {
      statusEl.textContent = 'Ready to download';
    }
  } catch {
    if (statusEl) statusEl.textContent = 'Ready to download';
  }
}

function renderDlConfigQualities(options) {
  const grid = document.getElementById('dlCfgQualityGrid');
  if (!grid) return;
  grid.innerHTML = '';

  dlConfigState.qualityOptions = options;
  dlConfigState.selectedQualityObj = options[0] || null;

  options.forEach((opt, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `dl-cfg-quality-card ${idx === 0 ? 'active' : ''}`;
    card.innerHTML = `
      <div class="dl-cfg-q-top">
        <span class="dl-cfg-q-name">${opt.quality}</span>
        <span class="dl-cfg-q-codec">${opt.codec || 'HEVC'}</span>
      </div>
      <div class="dl-cfg-q-size">${opt.sizeFormatted || formatBytes(opt.sizeBytes)}</div>
    `;
    card.addEventListener('click', () => {
      grid.querySelectorAll('.dl-cfg-quality-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      dlConfigState.selectedQualityObj = opt;
      updateDlConfigConfirmButton();
    });
    grid.appendChild(card);
  });

  updateDlConfigConfirmButton();
}

function updateDlConfigConfirmButton() {
  const btn = document.getElementById('dlCfgConfirmBtn');
  if (!btn) return;
  const q = dlConfigState.selectedQualityObj;
  if (q) {
    btn.textContent = `Download ${q.resolution || q.quality} (${q.sizeFormatted})`;
  } else {
    btn.textContent = 'Start Download';
  }
}

function syncFolderPresetActive(folderVal) {
  const norm = String(folderVal || '').trim().toLowerCase();
  document.querySelectorAll('.dl-folder-preset').forEach(btn => {
    btn.classList.toggle('active', String(btn.dataset.folder || '').trim().toLowerCase() === norm);
  });
}

async function executeConfiguredDownload() {
  const item = dlConfigState.item;
  if (!item) return;

  const folderInput = document.getElementById('dlCfgFolderInput');
  const targetFolder = (folderInput && folderInput.value.trim()) || 'D:\\Home Theater\\Downloads';
  localStorage.setItem('mb_dl_folder', targetFolder);

  const qObj = dlConfigState.selectedQualityObj || {};
  const quality = qObj.quality || qObj.resolution || item.quality || '1080p Full HD';
  const repId = qObj.repId || '0';
  const sizeBytes = qObj.sizeBytes || item.sizeBytes || 0;
  const streamUrl = qObj.streamUrl || dlConfigState.explicitStream?.streamUrl || item.streamUrl || null;
  const language = dlConfigState.selectedLanguage || 'Original';
  const audioType = dlConfigState.selectedAudioType || 'AAC 2.0 Stereo';

  document.getElementById('downloadConfigModal').classList.add('hidden');
  openDownloadsModal();

  try {
    const res = await fetch('/api/downloads/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.cleanTitle || item.title,
        poster: item.poster || item.backdrop || '',
        quality,
        language,
        audioType,
        repId,
        targetFolder,
        subjectId: dlConfigState.subjectId,
        se: dlConfigState.se,
        ep: dlConfigState.ep,
        url: streamUrl,
        sizeBytes
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Downloading "${data.download.title}" (${language} • ${audioType} • ${quality}) to ${targetFolder}`);
      refreshDownloadsUI();
    } else {
      showToast(`Download error: ${data.error}`);
    }
  } catch (err) {
    showToast(`Failed to start download: ${err.message}`);
  }
}

async function sendDownloadAction(id, action) {
  try {
    await fetch('/api/downloads/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action })
    });
    await refreshDownloadsUI();
    if (action === 'open-folder') {
      showToast('Opened download destination folder in Windows Explorer');
    }
  } catch {}
}

let lastCompletedCount = 0;
async function refreshDownloadsUI() {
  try {
    const res = await fetch('/api/downloads');
    const data = await res.json();
    if (!data.ok) return;

    const downloads = data.downloads || [];
    const activeJobs = downloads.filter(d => d.status === 'downloading' || d.status === 'starting');
    const completedJobs = downloads.filter(d => d.status === 'completed');
    const totalSpeed = activeJobs.reduce((acc, d) => acc + (d.speedBytesPerSec || 0), 0);

    // Update topbar & left rail badges
    const topBadge = document.getElementById('topDownloadsBadge');
    const railBadge = document.getElementById('railDownloadsBadge');
    if (topBadge) {
      topBadge.textContent = activeJobs.length > 0
        ? `${activeJobs.length} Active • ${formatSpeed(totalSpeed)}`
        : (downloads.length > 0 ? `${downloads.length} Ready` : 'Idle');
    }
    if (railBadge) {
      railBadge.textContent = String(activeJobs.length > 0 ? activeJobs.length : downloads.length);
    }

    // If a download newly completed, rescan local media so it appears in Home Theater Vault!
    if (completedJobs.length > lastCompletedCount) {
      lastCompletedCount = completedJobs.length;
      loadBackendState().then(() => renderLocalMediaRail()).catch(() => {});
    }

    const container = document.getElementById('downloadsListContainer');
    if (!container) return;

    if (downloads.length === 0) {
      container.innerHTML = `<div class="dl-empty-state">No active downloads. Click "Download" on any title to configure language, audio format, quality, and destination folder.</div>`;
      return;
    }

    container.innerHTML = '';
    downloads.forEach(d => {
      const card = document.createElement('div');
      card.className = 'dl-item-card';
      const isDownloading = d.status === 'downloading' || d.status === 'starting';
      const isPaused = d.status === 'paused';
      const isCompleted = d.status === 'completed';
      const isError = d.status === 'error';

      const statusLabel = isCompleted ? 'Completed'
        : (isPaused ? 'Paused'
        : (isError ? `Error: ${d.error || 'Failed'}`
        : (d.status === 'cancelled' ? 'Cancelled' : `Downloading (${d.progress.toFixed(1)}%)`)));

      const segInfo = d.totalSegments > 0 ? ` • Segment ${d.completedSegments}/${d.totalSegments}` : '';
      const langBadge = d.language ? `${d.language} • ` : '';
      const audioTypeBadge = d.audioType ? `${d.audioType} • ` : '';
      const folderInfo = d.targetFolder ? ` • ${d.targetFolder}` : '';

      card.innerHTML = `
        <div class="dl-item-top">
          <div class="dl-item-title-group">
            <div class="dl-item-title">${d.title} <span style="font-size:12px;color:#93c5fd;">[${langBadge}${audioTypeBadge}${d.quality}]</span></div>
            <div class="dl-item-sub">${d.filename}${segInfo}${folderInfo}</div>
          </div>
          <div class="dl-metrics-badges">
            ${isDownloading ? `<span class="dl-metric-pill speed">${formatSpeed(d.speedBytesPerSec)}</span>` : ''}
            ${isDownloading ? `<span class="dl-metric-pill eta">${formatEta(d.etaSeconds)}</span>` : ''}
            <span class="dl-metric-pill">${formatBytes(d.downloadedBytes)}${d.totalBytes > 0 ? ' / ' + formatBytes(d.totalBytes) : ''}</span>
            <span class="dl-metric-pill ${isCompleted ? 'status-completed' : (isError ? 'status-error' : '')}">${statusLabel}</span>
          </div>
        </div>
        <div class="dl-progress-wrap">
          <div class="dl-progress-bar" style="width: ${Math.max(2, d.progress)}%"></div>
        </div>
        <div class="dl-item-actions">
          <div class="dl-btn-group">
            ${isDownloading ? `<button class="dl-mini-btn" data-dl-act="pause">Pause</button>` : ''}
            ${(isPaused || isError) ? `<button class="dl-mini-btn" data-dl-act="resume">Resume</button>` : ''}
            ${(isDownloading || isPaused) ? `<button class="dl-mini-btn" data-dl-act="cancel">Cancel</button>` : ''}
            <button class="dl-mini-btn" data-dl-act="open-folder">Show in Folder</button>
            <button class="dl-mini-btn" data-dl-act="remove">Remove</button>
          </div>
          <div class="dl-btn-group">
            <button class="dl-mini-btn play" data-dl-play>Play</button>
            <button class="dl-mini-btn vlc" data-dl-vlc>Open in VLC</button>
          </div>
        </div>
      `;

      card.querySelectorAll('[data-dl-act]').forEach(btn => {
        btn.addEventListener('click', () => sendDownloadAction(d.id, btn.dataset.dlAct));
      });
      card.querySelector('[data-dl-play]').addEventListener('click', () => {
        document.getElementById('downloadsModal').classList.add('hidden');
        openTheaterPlayer({
          id: d.id,
          title: d.title,
          quality: d.quality,
          isLocal: true,
          fullPath: d.savePath,
          streamUrl: d.streamUrl,
          poster: d.poster
        });
      });
      card.querySelector('[data-dl-vlc]').addEventListener('click', () => {
        launchInVlc({
          id: d.id,
          title: d.title,
          quality: d.quality,
          fullPath: d.savePath,
          streamUrl: d.streamUrl
        });
      });

      container.appendChild(card);
    });
  } catch {}
}

function bindEvents() {
  document.getElementById('heroWatchBtn').addEventListener('click', () => {
    openTheaterPlayer(state.heroes[state.activeHeroIndex]);
  });
  document.getElementById('heroVlcBtn').addEventListener('click', () => {
    launchInVlc(state.heroes[state.activeHeroIndex]);
  });
  const heroDlBtn = document.getElementById('heroDownloadBtn');
  if (heroDlBtn) {
    heroDlBtn.addEventListener('click', () => {
      startDownload(state.heroes[state.activeHeroIndex]);
    });
  }
  document.getElementById('heroAddListBtn').addEventListener('click', () => {
    toggleWatchlist(state.heroes[state.activeHeroIndex]);
  });
  document.getElementById('heroInfoBtn').addEventListener('click', () => {
    openDetailsModal(state.heroes[state.activeHeroIndex]);
  });

  const watchDlBtn = document.getElementById('watchDownloadBtn');
  if (watchDlBtn) {
    watchDlBtn.addEventListener('click', () => {
      startDownload(state.currentItem, state.activeStream);
    });
  }

  // Pre-Download Configuration Modal bindings
  const closeDlCfgBtn = document.getElementById('closeDlConfigModalBtn');
  if (closeDlCfgBtn) {
    closeDlCfgBtn.addEventListener('click', () => {
      document.getElementById('downloadConfigModal').classList.add('hidden');
    });
  }
  const cancelDlCfgBtn = document.getElementById('dlCfgCancelBtn');
  if (cancelDlCfgBtn) {
    cancelDlCfgBtn.addEventListener('click', () => {
      document.getElementById('downloadConfigModal').classList.add('hidden');
    });
  }
  const confirmDlCfgBtn = document.getElementById('dlCfgConfirmBtn');
  if (confirmDlCfgBtn) {
    confirmDlCfgBtn.addEventListener('click', executeConfiguredDownload);
  }

  document.querySelectorAll('#dlCfgAudioTypePills .dl-cfg-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dlCfgAudioTypePills .dl-cfg-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dlConfigState.selectedAudioType = btn.dataset.audiotype || 'AAC 2.0 Stereo';
      const statusEl = document.getElementById('dlCfgStatusLine');
      if (statusEl && dlConfigState.qualityOptions.length > 0) {
        const epTag = dlConfigState.se > 0 ? ` • S${String(dlConfigState.se).padStart(2, '0')}E${String(dlConfigState.ep).padStart(2, '0')}` : '';
        statusEl.textContent = `Verified ${dlConfigState.qualityOptions.length} resolutions (${dlConfigState.selectedLanguage} • ${dlConfigState.selectedAudioType}${epTag})`;
      }
    });
  });

  const folderInputEl = document.getElementById('dlCfgFolderInput');
  if (folderInputEl) {
    folderInputEl.addEventListener('input', () => {
      dlConfigState.targetFolder = folderInputEl.value.trim();
      syncFolderPresetActive(dlConfigState.targetFolder);
    });
  }

  document.querySelectorAll('.dl-folder-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const folder = btn.dataset.folder;
      if (folderInputEl) folderInputEl.value = folder;
      dlConfigState.targetFolder = folder;
      syncFolderPresetActive(folder);
    });
  });

  const browseFolderBtn = document.getElementById('dlCfgBrowseBtn');
  if (browseFolderBtn) {
    browseFolderBtn.addEventListener('click', async () => {
      const origText = browseFolderBtn.textContent;
      browseFolderBtn.textContent = 'Opening...';
      try {
        const res = await fetch('/api/browse-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initialDir: folderInputEl?.value || 'D:\\Home Theater' })
        });
        const data = await res.json();
        if (data.ok && data.folderPath) {
          if (folderInputEl) folderInputEl.value = data.folderPath;
          dlConfigState.targetFolder = data.folderPath;
          syncFolderPresetActive(data.folderPath);
        }
      } catch {}
      browseFolderBtn.textContent = origText;
    });
  }

  const topDlBtn = document.getElementById('topDownloadsBtn');
  if (topDlBtn) topDlBtn.addEventListener('click', openDownloadsModal);

  const closeDlBtn = document.getElementById('closeDownloadsModalBtn');
  if (closeDlBtn) {
    closeDlBtn.addEventListener('click', () => {
      document.getElementById('downloadsModal').classList.add('hidden');
    });
  }

  const openDlFolderBtn = document.getElementById('openDownloadsFolderBtn');
  if (openDlFolderBtn) {
    openDlFolderBtn.addEventListener('click', async () => {
      await fetch('/api/open-folder', { method: 'POST' });
      showToast('Opened D:\\Home Theater in Windows Explorer');
    });
  }

  const dlStartDirectBtn = document.getElementById('dlStartDirectBtn');
  if (dlStartDirectBtn) {
    dlStartDirectBtn.addEventListener('click', () => {
      const title = document.getElementById('dlDirectTitleInput').value.trim() || 'Direct Media Download';
      const url = document.getElementById('dlDirectUrlInput').value.trim();
      if (!url) return showToast('Please paste a direct video or stream URL first');
      startDownload({ title, streamUrl: url, quality: '1080p Full HD' });
    });
  }

  const dlStreamDirectBtn = document.getElementById('dlStreamDirectBtn');
  if (dlStreamDirectBtn) {
    dlStreamDirectBtn.addEventListener('click', () => {
      const title = document.getElementById('dlDirectTitleInput').value.trim() || 'Direct Stream';
      const url = document.getElementById('dlDirectUrlInput').value.trim();
      if (!url) return showToast('Please paste a direct video or stream URL first');
      document.getElementById('downloadsModal').classList.add('hidden');
      openTheaterPlayer({
        id: 'direct_' + Date.now(),
        title,
        quality: '1080p Full HD',
        provider: 'Direct URL',
        streamUrl: url
      });
    });
  }

  // Start background polling for live download speed & progress
  setInterval(refreshDownloadsUI, 900);
  refreshDownloadsUI();

  document.querySelectorAll('.rail-item[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rail-item[data-nav]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const nav = btn.dataset.nav;
      if (nav === 'home') {
        showHomeBrowseView();
      } else if (nav === 'search') {
        const currentQ = document.getElementById('globalSearchInput')?.value.trim() || '';
        openDedicatedPage('search', currentQ);
        setTimeout(() => document.getElementById('dedicatedFilterInput')?.focus(), 80);
      } else {
        openDedicatedPage(nav);
      }
    });
  });

  document.querySelectorAll('.dock-tab[data-dock]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.dock-tab[data-dock]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const dock = btn.dataset.dock;
      if (dock === 'home') {
        showHomeBrowseView();
      } else {
        openDedicatedPage(dock);
      }
    });
  });

  document.getElementById('brandHomeBtn')?.addEventListener('click', showHomeBrowseView);
  document.getElementById('topBrandBadge')?.addEventListener('click', showHomeBrowseView);
  document.getElementById('dedicatedPageBackBtn')?.addEventListener('click', showHomeBrowseView);
  document.getElementById('profileSpaceBtn')?.addEventListener('click', () => openDedicatedPage('mylist'));

  document.querySelectorAll('[data-open-page]').forEach(btn => {
    btn.addEventListener('click', () => openDedicatedPage(btn.dataset.openPage));
  });

  let dedicatedSearchTimer = null;
  const dedicatedFilterInput = document.getElementById('dedicatedFilterInput');
  if (dedicatedFilterInput) {
    dedicatedFilterInput.addEventListener('input', () => {
      const val = dedicatedFilterInput.value.trim();
      if (state.activeDedicatedPage === 'search') {
        clearTimeout(dedicatedSearchTimer);
        dedicatedSearchTimer = setTimeout(() => {
          if (val.length >= 2) runDedicatedLiveSearch(val);
          else renderDedicatedPageContent('search');
        }, 280);
      } else if (state.activeDedicatedPage) {
        renderDedicatedPageContent(state.activeDedicatedPage);
      }
    });
  }

  const dedicatedSortSelect = document.getElementById('dedicatedSortSelect');
  if (dedicatedSortSelect) {
    dedicatedSortSelect.addEventListener('change', () => {
      if (state.activeDedicatedPage) {
        renderDedicatedPageContent(state.activeDedicatedPage);
      }
    });
  }

  document.querySelectorAll('.yt-chip').forEach(chip => {
    chip.addEventListener('click', () => applySectionFilter(chip.dataset.chip));
  });

  document.querySelectorAll('.hub-card').forEach(hub => {
    hub.addEventListener('click', () => applySectionFilter(hub.dataset.hub));
  });

  const searchInput = document.getElementById('globalSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');

  searchInput.addEventListener('input', () => {
    const val = searchInput.value;
    clearBtn.classList.toggle('hidden', !val);
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => performSearch(val), 250);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim().length > 0) {
      e.preventDefault();
      document.getElementById('searchDropdown')?.classList.add('hidden');
      openDedicatedPage('search', searchInput.value.trim());
    }
  });

  document.getElementById('searchSubmitBtn')?.addEventListener('click', () => {
    const q = searchInput.value.trim();
    document.getElementById('searchDropdown')?.classList.add('hidden');
    openDedicatedPage('search', q);
  });

  document.getElementById('viewAllSearchBtn')?.addEventListener('click', () => {
    document.getElementById('searchDropdown')?.classList.add('hidden');
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    document.getElementById('searchDropdown').classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape') {
      document.getElementById('searchDropdown').classList.add('hidden');
      document.getElementById('detailsModal').classList.add('hidden');
      document.getElementById('settingsModal').classList.add('hidden');
      document.getElementById('downloadsModal').classList.add('hidden');
      document.getElementById('downloadConfigModal')?.classList.add('hidden');
      document.getElementById('playerAudioSubPopover')?.classList.add('hidden');
    }
  });

  document.getElementById('voiceSearchBtn').addEventListener('click', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      searchInput.focus();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    showToast('Listening... Speak a movie or series title');
    rec.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      searchInput.value = transcript;
      performSearch(transcript);
    };
    rec.start();
  });

  const openFolderHandler = async () => {
    await fetch('/api/open-folder', { method: 'POST' });
    showToast('Opened D:\\Home Theater in Windows Explorer');
  };
  document.getElementById('openFolderBtn').addEventListener('click', openFolderHandler);
  document.getElementById('openExplorerRowBtn').addEventListener('click', openFolderHandler);

  document.getElementById('rescanLocalBtn').addEventListener('click', async () => {
    await loadBackendState();
    renderLocalMediaRail();
    showToast('Rescanned D:\\Home Theater local media files');
  });

  const refreshGaiaBtn = document.getElementById('refreshGaiaBtn');
  if (refreshGaiaBtn) {
    refreshGaiaBtn.addEventListener('click', () => fetchGaiaFlixCatalog(true));
  }

  document.getElementById('launchTuiBtn').addEventListener('click', async () => {
    await fetch('/api/launch-tui', { method: 'POST' });
    showToast('Launched classic moviebox-tui.exe terminal');
  });

  // =========================================================================
  // 9. LOCAL NETWORK QR & MULTI-DEVICE HOSTING MODAL
  // =========================================================================
  function renderQrCodeToElement(container, text) {
    if (!container) return;
    try {
      if (typeof window.qrcode === 'function') {
        const qr = window.qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        container.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 1, scalable: true });
        return;
      }
    } catch {}
    // Fallback QR image if offline from jsdelivr
    container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}" alt="QR Code for ${text}" />`;
  }

  async function openLanShareModal() {
    const modal = document.getElementById('lanShareModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const urlInput = document.getElementById('lanPrimaryUrlInput');
    const qrBox = document.getElementById('lanQrContainer');
    const ifaceList = document.getElementById('lanInterfacesList');
    const hostLabel = document.getElementById('lanHostnameLabel');

    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      if (data.ok) {
        const primary = data.primaryUrl || `http://localhost:3456`;
        if (urlInput) urlInput.value = primary;
        if (hostLabel && data.hostname) hostLabel.textContent = data.hostname;
        renderQrCodeToElement(qrBox, primary);

        if (ifaceList) {
          ifaceList.innerHTML = '';
          const list = (data.addresses && data.addresses.length > 0)
            ? data.addresses
            : [{ name: 'Localhost', address: '127.0.0.1', url: data.localUrl || 'http://localhost:3456' }];

          list.forEach((iface, idx) => {
            const row = document.createElement('div');
            row.className = `lan-iface-item ${idx === 0 ? 'active' : ''}`;
            row.innerHTML = `
              <span>${iface.name} (${iface.address})</span>
              <strong>${iface.url}</strong>
            `;
            row.addEventListener('click', () => {
              ifaceList.querySelectorAll('.lan-iface-item').forEach(el => el.classList.remove('active'));
              row.classList.add('active');
              if (urlInput) urlInput.value = iface.url;
              renderQrCodeToElement(qrBox, iface.url);
            });
            ifaceList.appendChild(row);
          });
        }
      }
    } catch {
      const fallbackUrl = window.location.origin;
      if (urlInput) urlInput.value = fallbackUrl;
      renderQrCodeToElement(qrBox, fallbackUrl);
    }
  }

  const openLanBtn = document.getElementById('openLanModalBtn');
  if (openLanBtn) openLanBtn.addEventListener('click', openLanShareModal);

  const closeLanBtn = document.getElementById('closeLanModalBtn');
  if (closeLanBtn) {
    closeLanBtn.addEventListener('click', () => {
      document.getElementById('lanShareModal').classList.add('hidden');
    });
  }

  const copyLanBtn = document.getElementById('copyLanUrlBtn');
  if (copyLanBtn) {
    copyLanBtn.addEventListener('click', () => {
      const urlVal = document.getElementById('lanPrimaryUrlInput')?.value || window.location.origin;
      navigator.clipboard.writeText(urlVal).catch(() => {});
      showToast(`Copied Local Network Link: ${urlVal}`);
    });
  }

  // =========================================================================
  // 10. YOUTUBE × VLC STUDIO PLAYER CONTROLS & TELEMETRY
  // =========================================================================
  const video = document.getElementById('mainVideo');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const scrubber = document.getElementById('videoScrubber');
  const scrubWrap = document.getElementById('scrubBarWrap');
  const scrubFill = document.getElementById('scrubProgressFill');
  const scrubBuf = document.getElementById('scrubBufferBar');
  const scrubTooltip = document.getElementById('scrubTooltip');
  const abLoopBar = document.getElementById('abLoopBar');
  const curLabel = document.getElementById('currentTimeLabel');
  const durLabel = document.getElementById('durationTimeLabel');

  playPauseBtn.addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
  });

  // Netflix / JioHotstar Center Transport Controls
  document.getElementById('centerPlayPauseBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video.paused) video.play();
    else video.pause();
  });
  document.getElementById('centerRewindBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
    showTouchSeekIndicator('-10s', 'left');
  });
  document.getElementById('centerForwardBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    video.currentTime = Math.min(video.duration || 9999, (video.currentTime || 0) + 10);
    showTouchSeekIndicator('+10s', 'right');
  });

  // Netflix / JioHotstar In-Player Top Bar & Floating Actions
  document.getElementById('playerOverlayBackBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    exitWatchView();
  });
  document.getElementById('backFromWatchBtn')?.addEventListener('click', exitWatchView);

  const toggleCinemaMode = () => {
    const watchEl = document.getElementById('watchView');
    if (!watchEl) return;
    const isCinema = watchEl.classList.toggle('cinema-mode');
    document.getElementById('cinemaModeToggleBtn')?.classList.toggle('active', isCinema);
    document.getElementById('playerOverlayCinemaBtn')?.classList.toggle('active', isCinema);
  };
  document.getElementById('cinemaModeToggleBtn')?.addEventListener('click', toggleCinemaMode);
  document.getElementById('playerOverlayCinemaBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCinemaMode();
  });

  document.getElementById('playerOverlayEpisodesBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('watchTabBtnEpisodes')?.click();
    document.getElementById('watchEpisodesBar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const audioSubPopover = document.getElementById('playerAudioSubPopover');
  const audioSubBtn = document.getElementById('playerOverlayAudioSubBtn');
  if (audioSubBtn && audioSubPopover) {
    audioSubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('playerEqPopover')?.classList.add('hidden');
      document.getElementById('playerVideoFxPopover')?.classList.add('hidden');
      const hidden = audioSubPopover.classList.toggle('hidden');
      audioSubBtn.classList.toggle('active', !hidden);
    });
  }
  document.getElementById('closeAudioSubPopoverBtn')?.addEventListener('click', () => {
    audioSubPopover?.classList.add('hidden');
    audioSubBtn?.classList.remove('active');
  });

  // Skip Intro Floating Button
  const skipIntroBtn = document.getElementById('skipIntroBtn');
  if (skipIntroBtn) {
    skipIntroBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      video.currentTime = Math.min(video.duration || 9999, (video.currentTime || 0) + 45);
      skipIntroBtn.classList.add('hidden');
      showToast('Skipped Intro (+45s)');
    });
  }

  // Watch Page Below-Player Tabs (Episodes & Streams | More Like This | Studio Specs)
  document.querySelectorAll('#watchPageTabs .watch-page-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('#watchPageTabs .watch-page-tab').forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
      const target = tabBtn.dataset.wtab;
      document.getElementById('watchTabEpisodesPane')?.classList.toggle('hidden', target !== 'episodes');
      document.getElementById('watchTabMoreLikeThisPane')?.classList.toggle('hidden', target !== 'morelikethis');
      document.getElementById('watchTabSpecsPane')?.classList.toggle('hidden', target !== 'specs');
    });
  });

  const videoContainer = document.getElementById('videoContainer');
  const touchFeedbackEl = document.getElementById('touchSeekFeedback');
  let controlsHideTimer = null;
  let lastTapTime = 0;
  let lastTapX = 0;

  function toggleVideoFullscreen() {
    const container = document.getElementById('videoContainer');
    const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsElem) {
      if (container && container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      } else if (container && container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (video && video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  function showTouchSeekIndicator(text, side) {
    if (!touchFeedbackEl) return;
    touchFeedbackEl.textContent = text;
    touchFeedbackEl.classList.remove('hidden', 'left', 'right');
    touchFeedbackEl.classList.add(side);
    clearTimeout(touchFeedbackEl._timer);
    touchFeedbackEl._timer = setTimeout(() => {
      touchFeedbackEl.classList.add('hidden');
    }, 650);
  }

  function scheduleControlsAutoHide() {
    if (!videoContainer) return;
    videoContainer.classList.remove('controls-idle');
    clearTimeout(controlsHideTimer);
    if (!video.paused) {
      controlsHideTimer = setTimeout(() => {
        const eqOpen = !document.getElementById('playerEqPopover')?.classList.contains('hidden');
        const vfxOpen = !document.getElementById('playerVideoFxPopover')?.classList.contains('hidden');
        const asOpen = !document.getElementById('playerAudioSubPopover')?.classList.contains('hidden');
        if (!video.paused && !eqOpen && !vfxOpen && !asOpen) {
          videoContainer.classList.add('controls-idle');
        }
      }, 3200);
    }
  }

  if (videoContainer) {
    videoContainer.addEventListener('mousemove', scheduleControlsAutoHide);
    videoContainer.addEventListener('touchstart', scheduleControlsAutoHide, { passive: true });
  }

  // Click / Tap on video canvas: supports Mobile/iPad double-tap seek (-10s / +10s) & Desktop play/pause
  video.addEventListener('touchend', (e) => {
    const touch = e.changedTouches?.[0];
    if (!touch || !videoContainer) return;
    const now = Date.now();
    const rect = videoContainer.getBoundingClientRect();
    const relX = (touch.clientX - rect.left) / Math.max(1, rect.width);

    if (now - lastTapTime < 300 && Math.abs(touch.clientX - lastTapX) < 80) {
      e.preventDefault();
      if (relX < 0.38) {
        video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
        showTouchSeekIndicator('-10s', 'left');
      } else if (relX > 0.62) {
        video.currentTime = Math.min(video.duration || 9999, (video.currentTime || 0) + 10);
        showTouchSeekIndicator('+10s', 'right');
      } else {
        toggleVideoFullscreen();
      }
      lastTapTime = 0;
      return;
    }
    lastTapTime = now;
    lastTapX = touch.clientX;
  });

  video.addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
    scheduleControlsAutoHide();
  });
  video.addEventListener('dblclick', () => {
    toggleVideoFullscreen();
  });

  // Video Loading Ring & Play/Pause State Events
  video.addEventListener('loadstart', () => {
    showVideoLoadingRing(
      `Loading ${state.activeStream?.quality || '1080p Full HD'}...`,
      `${state.currentItem?.cleanTitle || state.currentItem?.title || 'MovieBox CDN'} • ${getAudioTypeLabel(state.activeAudioType)}`
    );
  });
  video.addEventListener('waiting', () => {
    showVideoLoadingRing(
      'Buffering Stream...',
      `${state.activeStream?.quality || '1080p Full HD'} • ${getAudioTypeLabel(state.activeAudioType)}`
    );
  });
  video.addEventListener('seeking', () => {
    showVideoLoadingRing('Seeking...', formatSeconds(video.currentTime));
  });
  video.addEventListener('seeked', () => {
    if (video.readyState >= 2) hideVideoLoadingRing();
  });
  video.addEventListener('loadeddata', () => {
    hideVideoLoadingRing();
  });
  video.addEventListener('canplay', () => {
    hideVideoLoadingRing();
  });
  video.addEventListener('canplaythrough', () => {
    hideVideoLoadingRing();
  });
  let autoServerFailoverCount = 0;
  video.addEventListener('playing', () => {
    autoServerFailoverCount = 0;
    hideVideoLoadingRing();
    videoContainer?.classList.remove('is-paused');
  });
  video.addEventListener('error', (e) => {
    console.warn('Video element playback error:', e);
    hideVideoLoadingRing();
    if (state.currentStreams && state.currentStreams.length > 1 && autoServerFailoverCount < state.currentStreams.length - 1) {
      autoServerFailoverCount++;
      const curIdx = state.currentStreams.findIndex(s => s === state.activeStream);
      const nextIdx = (curIdx >= 0 && curIdx < state.currentStreams.length - 1) ? curIdx + 1 : 0;
      const nextStream = state.currentStreams[nextIdx];
      if (nextStream && nextStream !== state.activeStream) {
        showToast(`Auto-switching to ${nextStream.name}...`);
        onServerChange(nextIdx);
        return;
      }
    }
    document.getElementById('mkvAudioBanner')?.classList.remove('hidden');
  });

  const centerPlaySvg = document.getElementById('centerPlaySvg');
  video.addEventListener('play', () => {
    playPauseBtn.innerHTML = '⏸';
    document.getElementById('miniPlayPauseBtn').textContent = '⏸';
    videoContainer?.classList.remove('is-paused');
    if (centerPlaySvg) {
      centerPlaySvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    }
  });
  video.addEventListener('pause', () => {
    playPauseBtn.innerHTML = '▶';
    document.getElementById('miniPlayPauseBtn').textContent = '▶';
    videoContainer?.classList.add('is-paused');
    if (centerPlaySvg) {
      centerPlaySvg.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
    }
  });

  video.addEventListener('timeupdate', () => {
    const cur = video.currentTime || 0;
    const dur = video.duration || 0;
    curLabel.textContent = formatSeconds(cur);
    durLabel.textContent = formatSeconds(dur);

    if (!video.paused && video.readyState >= 3) {
      hideVideoLoadingRing();
    }

    // Show Skip Intro in first 95 seconds of playback
    if (skipIntroBtn) {
      skipIntroBtn.classList.toggle('hidden', cur > 95);
    }

    if (dur > 0) {
      // Enforce VLC A-B Repeat Loop if both points are set
      if (state.abLoop.a !== null && state.abLoop.b !== null && cur >= state.abLoop.b) {
        video.currentTime = state.abLoop.a;
        return;
      }

      const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
      scrubber.value = Math.floor(pct * 10);
      if (scrubFill) scrubFill.style.width = `${pct}%`;

      if (scrubBuf && video.buffered && video.buffered.length > 0) {
        const bufEnd = video.buffered.end(video.buffered.length - 1);
        const bufPct = Math.min(100, Math.max(0, (bufEnd / dur) * 100));
        scrubBuf.style.width = `${bufPct}%`;
      }
    }
    updateStatsForNerds();
  });

  scrubber.addEventListener('input', () => {
    if (video.duration > 0) {
      const pct = Number(scrubber.value) / 10;
      video.currentTime = (pct / 100) * video.duration;
      if (scrubFill) scrubFill.style.width = `${pct}%`;
    }
  });

  // Hover time tooltip on scrubber (YouTube style)
  if (scrubWrap && scrubTooltip) {
    scrubWrap.addEventListener('mousemove', (e) => {
      if (!video.duration || !isFinite(video.duration)) return;
      const rect = scrubWrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const previewSec = ratio * video.duration;
      scrubTooltip.textContent = formatSeconds(previewSec);
      scrubTooltip.style.left = `${ratio * 100}%`;
      scrubTooltip.classList.remove('hidden');
    });
    scrubWrap.addEventListener('mouseleave', () => {
      scrubTooltip.classList.add('hidden');
    });
  }

  document.getElementById('skipBackBtn').addEventListener('click', () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  document.getElementById('skipFwdBtn').addEventListener('click', () => {
    video.currentTime = Math.min(video.duration || 9999, video.currentTime + 10);
  });

  // VLC Frame Step (+1f)
  const frameStepBtn = document.getElementById('frameStepBtn');
  if (frameStepBtn) {
    frameStepBtn.addEventListener('click', () => {
      video.pause();
      video.currentTime = Math.min(video.duration || 9999, (video.currentTime || 0) + (1 / 24));
      showToast(`Stepped +1 frame (${formatSeconds(video.currentTime)})`);
    });
  }

  // VLC 200% Volume Boost Slider
  const volSlider = document.getElementById('volumeSlider');
  const muteBtn = document.getElementById('muteBtn');
  volSlider.addEventListener('input', () => {
    setPlayerVolumeAndBoost(volSlider.value, true);
  });
  muteBtn.addEventListener('click', () => {
    if (video.muted || Number(volSlider.value) === 0) {
      setPlayerVolumeAndBoost(state.lastUnmutedVol || 1, true);
    } else {
      state.lastUnmutedVol = Number(volSlider.value) || 1;
      setPlayerVolumeAndBoost(0, true);
    }
  });

  // VLC A-B Repeat Loop Button
  const abLoopBtn = document.getElementById('abLoopBtn');
  function updateAbLoopVisual() {
    if (!abLoopBar || !video.duration) return;
    if (state.abLoop.a !== null && state.abLoop.b !== null && state.abLoop.b > state.abLoop.a) {
      const leftPct = (state.abLoop.a / video.duration) * 100;
      const widthPct = ((state.abLoop.b - state.abLoop.a) / video.duration) * 100;
      abLoopBar.style.left = `${leftPct}%`;
      abLoopBar.style.width = `${widthPct}%`;
      abLoopBar.classList.remove('hidden');
    } else if (state.abLoop.a !== null) {
      const leftPct = (state.abLoop.a / video.duration) * 100;
      abLoopBar.style.left = `${leftPct}%`;
      abLoopBar.style.width = '1%';
      abLoopBar.classList.remove('hidden');
    } else {
      abLoopBar.classList.add('hidden');
    }
  }
  if (abLoopBtn) {
    abLoopBtn.addEventListener('click', () => {
      if (state.abLoop.a === null) {
        state.abLoop.a = video.currentTime || 0;
        state.abLoop.b = null;
        abLoopBtn.textContent = 'A-?';
        abLoopBtn.classList.add('active');
        showToast(`Loop Point A set at ${formatSeconds(state.abLoop.a)} — Click again to set Point B`);
      } else if (state.abLoop.b === null) {
        if ((video.currentTime || 0) > state.abLoop.a + 0.5) {
          state.abLoop.b = video.currentTime;
          abLoopBtn.textContent = 'A-B ON';
          showToast(`Looping between ${formatSeconds(state.abLoop.a)} and ${formatSeconds(state.abLoop.b)}`);
        } else {
          state.abLoop = { a: null, b: null };
          abLoopBtn.textContent = 'A-B';
          abLoopBtn.classList.remove('active');
          showToast('Cleared A-B Loop');
        }
      } else {
        state.abLoop = { a: null, b: null };
        abLoopBtn.textContent = 'A-B';
        abLoopBtn.classList.remove('active');
        showToast('Cleared A-B Loop');
      }
      updateAbLoopVisual();
    });
  }

  // VLC PNG Frame Snapshot Button
  const snapshotBtn = document.getElementById('snapshotBtn');
  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', () => {
      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth || 1920;
        c.height = video.videoHeight || 1080;
        const ctx = c.getContext('2d');
        ctx.drawImage(video, 0, 0, c.width, c.height);
        c.toBlob(blob => {
          if (!blob) return showToast('Snapshot unavailable for cross-origin frame');
          const a = document.createElement('a');
          const safeTitle = (state.currentItem?.cleanTitle || state.currentItem?.title || 'MovieBox').replace(/[^a-z0-9_-]+/gi, '_');
          a.href = URL.createObjectURL(blob);
          a.download = `${safeTitle}_${formatSeconds(video.currentTime).replace(/:/g, '-')}.png`;
          a.click();
          showToast(`Saved PNG frame snapshot (${c.width}x${c.height})`);
        }, 'image/png');
      } catch {
        showToast('Snapshot saved');
      }
    });
  }

  // VLC 5-Band Equalizer Popover
  const eqBtn = document.getElementById('playerEqBtn');
  const eqPopover = document.getElementById('playerEqPopover');
  const vfxBtn = document.getElementById('playerVideoFxBtn');
  const vfxPopover = document.getElementById('playerVideoFxPopover');

  if (eqBtn && eqPopover) {
    eqBtn.addEventListener('click', () => {
      ensureWebAudioGraph();
      vfxPopover?.classList.add('hidden');
      vfxBtn?.classList.remove('active');
      audioSubPopover?.classList.add('hidden');
      audioSubBtn?.classList.remove('active');
      const hidden = eqPopover.classList.toggle('hidden');
      eqBtn.classList.toggle('active', !hidden);
    });
  }

  document.querySelectorAll('#eqPresetsRow .eq-preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      applyEqPreset(btn.dataset.eqpreset, true);
      showToast(`VLC Equalizer preset: ${btn.textContent}`);
    });
  });

  const eqPreampEl = document.getElementById('eqPreamp');
  if (eqPreampEl) {
    eqPreampEl.addEventListener('input', () => {
      state.eqPreampDb = Number(eqPreampEl.value);
      const valSpan = document.getElementById('eqPreampVal');
      if (valSpan) valSpan.textContent = `${state.eqPreampDb >= 0 ? '+' : ''}${state.eqPreampDb}dB`;
      ensureWebAudioGraph();
    });
  }

  document.querySelectorAll('.eq-band-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const idx = Number(slider.dataset.band || 0);
      const db = Number(slider.value);
      state.eqBandsDb[idx] = db;
      const valSpan = slider.parentElement?.querySelector('.eq-val');
      if (valSpan) valSpan.textContent = `${db >= 0 ? '+' : ''}${db}dB`;
      ensureWebAudioGraph();
    });
  } );

  const resetEqBtn = document.getElementById('resetEqBtn');
  if (resetEqBtn) {
    resetEqBtn.addEventListener('click', () => {
      applyEqPreset('flat', true);
      setPlayerVolumeAndBoost(1, true);
      showToast('Reset Audio Equalizer & Gain to 100% Flat');
    });
  }

  // VLC Video Adjustments & Aspect Ratio Popover
  if (vfxBtn && vfxPopover) {
    vfxBtn.addEventListener('click', () => {
      eqPopover?.classList.add('hidden');
      eqBtn?.classList.remove('active');
      audioSubPopover?.classList.add('hidden');
      audioSubBtn?.classList.remove('active');
      const hidden = vfxPopover.classList.toggle('hidden');
      vfxBtn.classList.toggle('active', !hidden);
    });
  }

  document.querySelectorAll('#aspectRatioRow .eq-preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#aspectRatioRow .eq-preset-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.vfx.aspect = btn.dataset.aspect || 'fit';
      updateVideoFilterStyles();
      showToast(`Aspect Ratio: ${btn.textContent}`);
    });
  });

  ['Brightness', 'Contrast', 'Saturation', 'Hue'].forEach(prop => {
    const slider = document.getElementById(`vfx${prop}`);
    const valEl = document.getElementById(`vfx${prop}Val`);
    if (slider) {
      slider.addEventListener('input', () => {
        const key = prop.toLowerCase();
        state.vfx[key] = Number(slider.value);
        if (valEl) valEl.textContent = key === 'hue' ? `${slider.value}°` : `${slider.value}%`;
        updateVideoFilterStyles();
      });
    }
  });

  const resetVfxBtn = document.getElementById('resetVideoFxBtn');
  if (resetVfxBtn) {
    resetVfxBtn.addEventListener('click', () => {
      state.vfx = { brightness: 100, contrast: 100, saturation: 100, hue: 0, aspect: 'fit' };
      ['Brightness', 'Contrast', 'Saturation'].forEach(p => {
        const s = document.getElementById(`vfx${p}`);
        const v = document.getElementById(`vfx${p}Val`);
        if (s) s.value = '100';
        if (v) v.textContent = '100%';
      });
      const hS = document.getElementById('vfxHue');
      const hV = document.getElementById('vfxHueVal');
      if (hS) hS.value = '0';
      if (hV) hV.textContent = '0°';
      document.querySelectorAll('#aspectRatioRow .eq-preset-pill').forEach((b, i) => b.classList.toggle('active', i === 0));
      updateVideoFilterStyles();
      showToast('Reset Video Filters & Aspect Ratio');
    });
  }

  // Stats for Nerds Telemetry Overlay
  const sfnBtn = document.getElementById('statsForNerdsBtn');
  const sfnOverlay = document.getElementById('statsForNerdsOverlay');
  const closeSfnBtn = document.getElementById('closeStatsForNerdsBtn');
  if (sfnBtn && sfnOverlay) {
    sfnBtn.addEventListener('click', () => {
      const hidden = sfnOverlay.classList.toggle('hidden');
      sfnBtn.classList.toggle('active', !hidden);
      if (!hidden) updateStatsForNerds();
    });
  }
  if (closeSfnBtn && sfnOverlay) {
    closeSfnBtn.addEventListener('click', () => {
      sfnOverlay.classList.add('hidden');
      sfnBtn?.classList.remove('active');
    });
  }

  // Keyboard shortcuts when Watch View is active
  document.addEventListener('keydown', (e) => {
    const watchVisible = !document.getElementById('watchView').classList.contains('hidden');
    if (!watchVisible || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    if (e.key === ' ' || e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (video.paused) video.play();
      else video.pause();
    } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
      e.preventDefault();
      video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
      e.preventDefault();
      video.currentTime = Math.min(video.duration || 9999, (video.currentTime || 0) + 10);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextVol = Math.min(2, Math.round((Number(volSlider.value) + 0.1) * 100) / 100);
      setPlayerVolumeAndBoost(nextVol, true);
      showToast(`Volume: ${Math.round(nextVol * 100)}%`);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextVol = Math.max(0, Math.round((Number(volSlider.value) - 0.1) * 100) / 100);
      setPlayerVolumeAndBoost(nextVol, true);
      showToast(`Volume: ${Math.round(nextVol * 100)}%`);
    } else if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      muteBtn.click();
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      document.getElementById('fullscreenBtn').click();
    } else if (e.key.toLowerCase() === 'e') {
      e.preventDefault();
      frameStepBtn?.click();
    }
  });

  document.getElementById('serverSelector')?.addEventListener('change', (e) => {
    onServerChange(e.target.value);
  });
  document.getElementById('topServerSelector')?.addEventListener('change', (e) => {
    onServerChange(e.target.value);
  });

  document.getElementById('speedSelector').addEventListener('change', (e) => {
    video.playbackRate = Number(e.target.value);
    showToast(`Playback speed: ${e.target.value}x`);
  });

  document.getElementById('qualitySelector').addEventListener('change', (e) => {
    const val = e.target.value;
    const selectedOpt = e.target.options[e.target.selectedIndex];
    const qLabel = selectedOpt ? (selectedOpt.dataset.qualityLabel || selectedOpt.text) : val;
    showVideoLoadingRing(`Switching to ${qLabel}...`, 'Adaptive Bitrate Stream');
    setTimeout(() => {
      if (!video.paused && video.readyState >= 3) hideVideoLoadingRing();
    }, 1100);

    if (state.dashInstance) {
      if (val === 'auto') {
        state.dashInstance.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
      } else {
        state.dashInstance.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
        const repIdx = parseInt(val, 10);
        if (!isNaN(repIdx)) {
          state.dashInstance.setQualityFor('video', repIdx, true);
        }
      }
    }
    if (selectedOpt && state.activeStream && val !== 'auto') {
      const sLabel = selectedOpt.dataset.sizeFormatted || state.activeStream.sizeFormatted || '';
      state.activeStream.quality = qLabel;
      if (sLabel) state.activeStream.sizeFormatted = sLabel;
      document.getElementById('playerSourcePill').textContent = `MOVIEBOX CDN • ${qLabel}${sLabel ? ` (${sLabel})` : ''}`;
      updateWatchBadgesAndAudioSummary();
    }
    showToast(`Resolution set to ${selectedOpt ? selectedOpt.text : val}`);
  });

  document.getElementById('subtitleSelector').addEventListener('change', (e) => {
    const val = e.target.value;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = val === 'off' ? 'disabled' : 'showing';
    }
    showToast(`Subtitles: ${e.target.options[e.target.selectedIndex].text}`);
  });

  document.getElementById('pipBtn').addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {}
  });

  document.getElementById('fullscreenBtn').addEventListener('click', () => {
    toggleVideoFullscreen();
  });

  // Smart TV Remote D-Pad Spatial Navigation (ArrowUp / ArrowDown / ArrowLeft / ArrowRight in Browse View)
  document.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const watchVisible = !document.getElementById('watchView').classList.contains('hidden');
    if (watchVisible || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    const focusables = Array.from(document.querySelectorAll(
      '.rail-item, .yt-chip, .action-pill, .btn-hero-play, .btn-hero-vlc, .btn-hero-download, .btn-hero-secondary, .hub-card, .wide-card, .poster-card, .dedicated-subpill'
    )).filter(el => el.offsetParent !== null && !el.closest('.hidden'));

    if (focusables.length === 0) return;
    const current = document.activeElement;
    if (!focusables.includes(current)) {
      const firstHeroBtn = focusables[0];
      e.preventDefault();
      firstHeroBtn.focus();
      return;
    }

    const curRect = current.getBoundingClientRect();
    const curCx = curRect.left + curRect.width / 2;
    const curCy = curRect.top + curRect.height / 2;

    let bestCandidate = null;
    let bestScore = Infinity;

    for (const cand of focusables) {
      if (cand === current) continue;
      const r = cand.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - curCx;
      const dy = cy - curCy;

      if (e.key === 'ArrowRight' && dx <= 12) continue;
      if (e.key === 'ArrowLeft' && dx >= -12) continue;
      if (e.key === 'ArrowDown' && dy <= 16) continue;
      if (e.key === 'ArrowUp' && dy >= -16) continue;

      const primaryDist = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? Math.abs(dx) : Math.abs(dy);
      const orthoDist = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? Math.abs(dy) : Math.abs(dx);
      const score = primaryDist + orthoDist * 2.6;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    if (bestCandidate) {
      e.preventDefault();
      bestCandidate.focus({ preventScroll: true });
      bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  document.getElementById('ambientToggleBtn').addEventListener('click', () => {
    state.uiData.ambientMode = !state.uiData.ambientMode;
    document.getElementById('playerStage').classList.toggle('ambient-off', !state.uiData.ambientMode);
    document.getElementById('ambientToggleBtn').classList.toggle('active', state.uiData.ambientMode);
    document.getElementById('ambientStateLabel').textContent = state.uiData.ambientMode ? 'ON' : 'OFF';
  });

  document.getElementById('theaterExpandBtn').addEventListener('click', () => {
    document.getElementById('watchLayout').classList.toggle('wide-theater');
  });

  document.getElementById('playerLaunchVlcBtn').addEventListener('click', () => launchInVlc(state.currentItem, null, state.activeStream));
  document.getElementById('metaLaunchVlcBtn').addEventListener('click', () => launchInVlc(state.currentItem, null, state.activeStream));
  document.getElementById('bannerLaunchVlcBtn').addEventListener('click', () => launchInVlc(state.currentItem, null, state.activeStream));

  // Switch local E-AC3 MKV to Cloud AAC Stereo stream for Web Player audio
  const bannerCloudBtn = document.getElementById('bannerPlayCloudBtn');
  if (bannerCloudBtn) {
    bannerCloudBtn.addEventListener('click', async () => {
      document.getElementById('mkvAudioBanner').classList.add('hidden');
      const queryTitle = state.currentItem?.cleanTitle || state.currentItem?.title || 'Spider-Man';
      showToast(`Searching MovieBox Cloud AAC Stereo stream for "${queryTitle}"...`);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(queryTitle)}`);
        const data = await res.json();
        const cloudMatch = (data.results || []).find(r => r.subjectId || String(r.id || '').startsWith('mb_'));
        if (cloudMatch) {
          openTheaterPlayer(cloudMatch);
          return;
        }
      } catch {}
      // Fallback to high-bitrate AAC 2.0 stereo stream if title isn't on MovieBox yet
      if (state.heroes && state.heroes[1]) {
        openTheaterPlayer(state.heroes[1]);
      }
    });
  }

  document.getElementById('bannerSwitchSampleBtn').addEventListener('click', () => {
    document.getElementById('mkvAudioBanner').classList.add('hidden');
  });

  document.getElementById('minimizeToMiniPlayerBtn').addEventListener('click', () => {
    document.getElementById('watchView').classList.add('hidden');
    if (state.previousView === 'dedicated' && state.activeDedicatedPage) {
      document.getElementById('dedicatedPageView')?.classList.remove('hidden');
    } else {
      document.getElementById('browseView')?.classList.remove('hidden');
      document.getElementById('filterChipsBar')?.classList.remove('hidden');
    }
    const mini = document.getElementById('miniPlayerBar');
    mini.classList.remove('hidden');
    if (state.currentItem) {
      document.getElementById('miniPlayerImg').src = state.currentItem.backdrop || state.currentItem.poster;
      document.getElementById('miniPlayerTitle').textContent = state.currentItem.title;
      document.getElementById('miniPlayerSub').textContent = `${state.currentItem.quality || '1080p'} • Playing`;
    }
  });

  document.getElementById('miniPlayerExpandBtn').addEventListener('click', () => {
    document.getElementById('miniPlayerBar').classList.add('hidden');
    document.getElementById('browseView')?.classList.add('hidden');
    document.getElementById('dedicatedPageView')?.classList.add('hidden');
    document.getElementById('filterChipsBar')?.classList.add('hidden');
    document.getElementById('watchView').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('miniPlayPauseBtn').addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
  });

  document.getElementById('miniVlcBtn').addEventListener('click', () => launchInVlc(state.currentItem, null, state.activeStream));

  document.getElementById('closePlayerBtn').addEventListener('click', exitWatchView);
  document.getElementById('miniCloseBtn').addEventListener('click', () => {
    video.pause();
    document.getElementById('miniPlayerBar').classList.add('hidden');
  });

  document.getElementById('watchLikeBtn').addEventListener('click', () => {
    showToast(`Liked "${state.currentItem?.title || 'Video'}"`);
  });
  document.getElementById('watchAddListBtn').addEventListener('click', () => {
    if (state.currentItem) toggleWatchlist(state.currentItem);
  });
  document.getElementById('watchCopyStreamBtn').addEventListener('click', () => {
    const pathOrUrl = state.activeStream?.vlcUrl || state.currentItem?.fullPath || window.location.href;
    navigator.clipboard.writeText(pathOrUrl).catch(() => {});
    showToast(`Copied stream URL: ${pathOrUrl}`);
  });

  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.stab;
      document.getElementById('sidebarSourcesPane').classList.toggle('hidden', target !== 'sources');
      document.getElementById('sidebarUpnextPane').classList.toggle('hidden', target !== 'upnext');
      document.getElementById('sidebarLivetvPane').classList.toggle('hidden', target !== 'livetv');
    });
  });

  document.getElementById('closeDetailsModalBtn').addEventListener('click', () => {
    document.getElementById('detailsModal').classList.add('hidden');
  });

  const openSettings = () => document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('openSettingsModalBtn').addEventListener('click', openSettings);
  document.getElementById('openIptvModalBtn').addEventListener('click', openSettings);
  document.getElementById('addM3uRowBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettingsModalBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });

  document.getElementById('playCustomStreamNowBtn').addEventListener('click', () => {
    const title = document.getElementById('customStreamTitle').value.trim() || 'Custom Stream';
    const url = document.getElementById('customStreamUrl').value.trim();
    if (!url) return showToast('Please enter a stream URL or file path');
    document.getElementById('settingsModal').classList.add('hidden');
    openTheaterPlayer({
      id: 'custom_' + Date.now(),
      title,
      year: 'LIVE / CUSTOM',
      quality: 'HD / 4K',
      provider: 'Custom Stream',
      streamUrl: url,
      fullPath: url.includes(':\\') ? url : null
    });
  });

  document.getElementById('vlcCustomStreamNowBtn').addEventListener('click', () => {
    const title = document.getElementById('customStreamTitle').value.trim() || 'Custom Stream';
    const url = document.getElementById('customStreamUrl').value.trim();
    if (!url) return showToast('Please enter a stream URL or file path');
    launchInVlc({ title, fullPath: url, streamUrl: url });
  });

  document.getElementById('saveCustomIptvBtn').addEventListener('click', async () => {
    const name = document.getElementById('customStreamTitle').value.trim() || 'Custom Live Channel';
    const streamUrl = document.getElementById('customStreamUrl').value.trim();
    if (!streamUrl) return showToast('Please enter a stream URL');
    state.uiData.customIptv = state.uiData.customIptv || [];
    state.uiData.customIptv.unshift({
      id: 'iptv_' + Date.now(),
      name,
      category: 'Custom Live',
      language: 'Multi',
      quality: '1080p LIVE',
      logo: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=600&q=80',
      streamUrl
    });
    await saveHistoryEntry({ id: 'iptv', title: name });
    renderLiveTvRail();
    document.getElementById('settingsModal').classList.add('hidden');
    showToast(`Added "${name}" to Live TV Channels`);
  });

  // =========================================================================
  // PWA APP INSTALLATION & CLOUD MODE DETECTION (Phone & Anywhere)
  // =========================================================================
  let deferredInstallPrompt = null;
  const pwaInstallBanner = document.getElementById('pwaInstallBanner');
  const pwaInstallModal = document.getElementById('pwaInstallModal');
  const installPwaBtn = document.getElementById('installPwaBtn');
  const pwaBannerInstallBtn = document.getElementById('pwaBannerInstallBtn');
  const pwaBannerDismissBtn = document.getElementById('pwaBannerDismissBtn');
  const pwaNativeInstallBtn = document.getElementById('pwaNativeInstallBtn');
  const pwaNativePromptBlock = document.getElementById('pwaNativePromptBlock');
  const closePwaModalBtn = document.getElementById('closePwaModalBtn');
  const cloudModeBadge = document.getElementById('cloudModeBadge');

  // Check if currently running as standalone installed app
  const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandaloneApp) {
    if (installPwaBtn) installPwaBtn.classList.add('hidden');
    if (pwaInstallBanner) pwaInstallBanner.classList.add('hidden');
  }

  // Register PWA Service Worker for phone & desktop offline capability
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[MovieBox PWA] Service Worker registered with scope:', reg.scope);
      }).catch((err) => {
        console.warn('[MovieBox PWA] Service Worker registration note:', err?.message || err);
      });
    });
  }

  // Listen for native beforeinstallprompt (Chrome / Edge / Android)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (pwaNativePromptBlock) pwaNativePromptBlock.classList.remove('hidden');
    if (!isStandaloneApp && pwaInstallBanner && !sessionStorage.getItem('mb_pwa_dismissed')) {
      pwaInstallBanner.classList.remove('hidden');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    pwaInstallBanner?.classList.add('hidden');
    pwaInstallModal?.classList.add('hidden');
    installPwaBtn?.classList.add('hidden');
    showToast('MovieBox Studio successfully installed as app!');
  });

  const openPwaModal = () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') {
          deferredInstallPrompt = null;
          pwaInstallBanner?.classList.add('hidden');
        }
      });
      return;
    }
    pwaInstallModal?.classList.remove('hidden');
  };

  installPwaBtn?.addEventListener('click', openPwaModal);
  pwaBannerInstallBtn?.addEventListener('click', openPwaModal);
  pwaNativeInstallBtn?.addEventListener('click', () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') {
          deferredInstallPrompt = null;
          pwaInstallModal?.classList.add('hidden');
          pwaInstallBanner?.classList.add('hidden');
        }
      });
    }
  });

  pwaBannerDismissBtn?.addEventListener('click', () => {
    pwaInstallBanner?.classList.add('hidden');
    sessionStorage.setItem('mb_pwa_dismissed', '1');
  });

  closePwaModalBtn?.addEventListener('click', () => {
    pwaInstallModal?.classList.add('hidden');
  });

  // Activate Cloud Mode indicator when on Vercel or cloud
  if (state.system?.isCloud || window.location.hostname.includes('vercel.app')) {
    if (cloudModeBadge) {
      cloudModeBadge.classList.remove('hidden');
    }
    const localVaultBtn = document.getElementById('openFolderBtn');
    if (localVaultBtn) {
      localVaultBtn.title = 'Running on Vercel Cloud Edge';
      localVaultBtn.innerHTML = '<span class="status-dot online" style="background:#06b6d4;box-shadow:0 0 8px #06b6d4"></span><span>Cloud Edge</span>';
    }
  }
}

document.addEventListener('DOMContentLoaded', initApp);
