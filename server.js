const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { URL } = require('url');
const {
  getUnifiedHomeData,
  searchUnifiedCatalog,
  getUnifiedSubject,
  buildServerStreams,
  UNIFIED_ITEMS
} = require('./unified-data.js');

process.on('uncaughtException', err => {
  console.error('[MovieBox Studio] Non-fatal error:', err?.message || err);
});
process.on('unhandledRejection', err => {
  console.error('[MovieBox Studio] Non-fatal rejection:', err?.message || err);
});

const PORT = process.env.PORT || 3456;
const APP_DIR = __dirname;
const IS_VERCEL = !!(process.env.VERCEL || process.env.NOW_REGION);
const UI_DIR = fs.existsSync(path.join(APP_DIR, 'public')) ? path.join(APP_DIR, 'public') : path.join(APP_DIR, 'ui');
const HOME_THEATER_DIR = IS_VERCEL ? path.join(os.tmpdir(), 'home-theater') : path.resolve(APP_DIR, '..');
const UI_DATA_FILE = IS_VERCEL ? path.join(os.tmpdir(), 'ui-data.json') : path.join(APP_DIR, 'ui-data.json');

// Preload static PWA core assets in memory for 0ms delivery and Vercel serverless resilience
function readFirstExisting(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const c = fs.readFileSync(p, 'utf8');
        if (c && c.length > 0) return c;
      }
    } catch {}
  }
  return '';
}

const STATIC_IN_MEMORY = {
  '/index.html': readFirstExisting([path.join(APP_DIR, 'public', 'index.html'), path.join(APP_DIR, 'ui', 'index.html'), path.join(APP_DIR, 'index.html')]),
  '/styles.css': readFirstExisting([path.join(APP_DIR, 'public', 'styles.css'), path.join(APP_DIR, 'ui', 'styles.css'), path.join(APP_DIR, 'styles.css')]),
  '/app.js': readFirstExisting([path.join(APP_DIR, 'public', 'app.js'), path.join(APP_DIR, 'ui', 'app.js'), path.join(APP_DIR, 'app.js')]),
  '/sw.js': readFirstExisting([path.join(APP_DIR, 'public', 'sw.js'), path.join(APP_DIR, 'ui', 'sw.js'), path.join(APP_DIR, 'sw.js')]),
  '/manifest.json': readFirstExisting([path.join(APP_DIR, 'public', 'manifest.json'), path.join(APP_DIR, 'ui', 'manifest.json'), path.join(APP_DIR, 'manifest.json')])
};

// MovieBox-TUI native AppData paths on Windows / Cloud tmpdir
const APPDATA = process.env.APPDATA || (IS_VERCEL ? path.join(os.tmpdir(), 'roaming') : path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'));
const LOCALAPPDATA = process.env.LOCALAPPDATA || (IS_VERCEL ? path.join(os.tmpdir(), 'local') : path.join(process.env.USERPROFILE || '', 'AppData', 'Local'));
const TUI_CONFIG_DIR = path.join(APPDATA, 'moviebox-tui');
const TUI_CONFIG_FILE = path.join(TUI_CONFIG_DIR, 'config.json');
const TUI_HISTORY_FILE = path.join(TUI_CONFIG_DIR, 'history.json');
const TUI_ADDONS_FILE = path.join(TUI_CONFIG_DIR, 'addons_config.json');
const SUBS_CACHE_DIR = path.join(LOCALAPPDATA, 'moviebox-tui', 'subs');

// ============================================================================
// 1. NATIVE MOVIEBOX API CLIENT (EXACT CRYPTO SIGNING & HOST POOL FROM RUST)
// ============================================================================
const MOVIEBOX_HOSTS = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api4sg.aoneroom.com',
  'https://api3.aoneroom.com',
  'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com'
];

const MOVIEBOX_SECRET = Buffer.from([
  0xef, 0xa8, 0x91, 0x97, 0x4e, 0xec, 0xd3, 0x14, 0x8d, 0xf6,
  0x3a, 0xa6, 0x11, 0x60, 0x2d, 0xef, 0xd1, 0x01, 0x25, 0x9b,
  0xa5, 0x21, 0x02, 0x2c, 0x57, 0xae, 0x05, 0x66, 0xbd, 0x8e
]);

const MOVIEBOX_UA = 'com.community.oneroom/50020542 (Linux; U; Android 13; en_US; 23049PCD8G; Build/TQ2A.230405.003; Cronet/135.0.7012.3)';
const SPOOF_IP_POOL = [
  '103.241.44.12',
  '49.36.128.45',
  '106.51.72.118',
  '122.161.50.89',
  '157.48.210.34',
  '117.211.88.19',
  '27.59.114.77',
  '182.71.104.22'
];

let mbDeviceId = crypto.randomBytes(16).toString('hex');
let mbGaid = crypto.randomUUID();
let mbSpoofedIp = SPOOF_IP_POOL[0];
let mbClientInfoStr = '';

function rotateMovieBoxIdentity() {
  mbDeviceId = crypto.randomBytes(16).toString('hex');
  mbGaid = crypto.randomUUID();
  const randOctet = Math.floor(Math.random() * 220) + 15;
  const baseIp = SPOOF_IP_POOL[Math.floor(Math.random() * SPOOF_IP_POOL.length)];
  mbSpoofedIp = baseIp.replace(/\.\d+$/, `.${randOctet}`);
  mbClientInfoStr = JSON.stringify({
    package_name: 'com.community.oneroom',
    version_name: '4.0.01.0813.03',
    version_code: 50020542,
    os: 'android',
    os_version: '13',
    install_ch: 'ps',
    device_id: mbDeviceId,
    install_store: 'ps',
    gaid: mbGaid,
    brand: 'POCO',
    model: '23049PCD8G',
    system_language: 'en',
    net: 'NETWORK_WIFI',
    region: 'US',
    timezone: 'Asia/Kolkata',
    sp_code: '40401',
    'X-Play-Mode': '2'
  });
  mbSessionToken = null;
  mbSessionExpiry = 0;
}

const STREAM_REFERER = 'https://sportslive.wine';

let mbSessionToken = null;
let mbSessionExpiry = 0;
let activeHostIdx = 0;

rotateMovieBoxIdentity();

// Active DASH proxy sessions: streamKey -> { baseUrl, signCookie, title, subjectId, createdAt }
const dashProxySessions = new Map();
// Cache subject details, home responses, GaiaFlix & NetMirror to avoid exhausting rate-limits
const detailsCache = new Map();
let homeCache = { data: null, expiresAt: 0 };
let gaiaflixCache = { data: null, expiresAt: 0 };
let netmirrorCache = { data: null, expiresAt: 0 };

function encodeStreamKey(baseUrl, signCookie, subjectId, se = 0, ep = 0) {
  try {
    const payload = {
      b: String(baseUrl || '').trim(),
      c: String(signCookie || '').trim().replace(/;+$/, ''),
      s: String(subjectId || ''),
      se: Number(se) || 0,
      ep: Number(ep) || 0,
      t: Date.now()
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  } catch {
    return crypto.randomBytes(8).toString('hex');
  }
}

function decodeStreamKey(streamKey) {
  if (!streamKey || typeof streamKey !== 'string') return null;
  const cached = dashProxySessions.get(streamKey);
  if (cached) return cached;
  try {
    const raw = Buffer.from(streamKey, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.b && parsed.c) {
      const session = {
        baseUrl: parsed.b,
        signCookie: parsed.c,
        subjectId: parsed.s,
        se: parsed.se || 0,
        ep: parsed.ep || 0,
        createdAt: parsed.t || Date.now()
      };
      dashProxySessions.set(streamKey, session);
      return session;
    }
  } catch {}
  return null;
}

function decodeGaiaStreamUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const str = String(url).trim();
  if (str.includes('bintv-sources.pages.dev') || str.includes('/bintv/')) {
    return str;
  }
  try {
    const parsed = new URL(str);
    const id = parsed.searchParams.get('id');
    if (id) {
      let b64 = id.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      let dec = Buffer.from(b64, 'base64').toString('utf8');
      if (/^https?:\/\//i.test(dec) && !dec.includes('/bintv/')) {
        return dec.replace(/^http:\/\//i, 'https://');
      }
    }
  } catch {}
  return str.replace(/^http:\/\//i, 'https://');
}

function categorizeGaiaChannel(name) {
  const n = String(name || '').toLowerCase();
  if (/sport|espn|bein|nba|nhl|mlb|nfl|wwe|fight|golf|tennis|arena|racing|f1|mutv|sky sports|fox sports|tnt sports|willow|cric|football|soccer|ufc|boxing/i.test(n)) {
    return { genreKey: 'sports', genreLabel: 'Sports' };
  }
  if (/hbo|cinema|movie|showtime|starz|film|amc|paramount|hallmark|tcm|fx|cine|flix/i.test(n)) {
    return { genreKey: 'movies', genreLabel: 'Movies & TV' };
  }
  if (/news|cnn|bbc|cnbc|msnbc|fox news|bloomberg|weather|cspan|al jazeera|euronews/i.test(n)) {
    return { genreKey: 'news', genreLabel: 'News & World' };
  }
  if (/disney|cartoon|nick|boomerang|toon|kids|baby|cbeebies/i.test(n)) {
    return { genreKey: 'kids', genreLabel: 'Kids & Family' };
  }
  return { genreKey: 'entertainment', genreLabel: 'Entertainment' };
}

function md5Hex(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function buildMovieBoxSignedHeaders(method, fullUrl, bodyStr, token) {
  const ts = Date.now();
  const revTs = String(ts).split('').reverse().join('');
  const clientToken = `${ts},${md5Hex(Buffer.from(revTs))}`;

  const u = new URL(fullUrl);
  const sortedParams = Array.from(u.searchParams.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonicalUrl = sortedParams ? `${u.pathname}?${sortedParams}` : u.pathname;

  const bodyBuf = bodyStr != null ? Buffer.from(bodyStr, 'utf8') : null;
  const bodyHash = bodyBuf ? md5Hex(bodyBuf.subarray(0, 102400)) : '';
  const bodyLen = bodyBuf ? String(bodyBuf.length) : '';

  const canonical = `${method.toUpperCase()}\napplication/json\napplication/json\n${bodyLen}\n${ts}\n${bodyHash}\n${canonicalUrl}`;
  const sigB64 = crypto.createHmac('md5', MOVIEBOX_SECRET).update(canonical).digest('base64');

  const headers = {
    'User-Agent': MOVIEBOX_UA,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Connection': 'keep-alive',
    'x-client-token': clientToken,
    'x-tr-signature': `${ts}|2|${sigB64}`,
    'x-client-info': mbClientInfoStr,
    'x-client-status': '0',
    'x-forwarded-for': mbSpoofedIp
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function ensureMovieBoxToken(forceRefresh = false) {
  if (!forceRefresh && mbSessionToken && Date.now() < mbSessionExpiry) {
    return mbSessionToken;
  }
  if (forceRefresh) {
    rotateMovieBoxIdentity();
  }

  const timeoutMs = IS_VERCEL ? 1800 : 4500;
  const maxHostsToTry = IS_VERCEL ? 2 : MOVIEBOX_HOSTS.length;

  for (let i = 0; i < maxHostsToTry; i++) {
    const idx = (activeHostIdx + i) % MOVIEBOX_HOSTS.length;
    const host = MOVIEBOX_HOSTS[idx];
    const url = `${host}/wefeed-mobile-bff/user-api/visitor-login`;
    try {
      const headers = buildMovieBoxSignedHeaders('POST', url, '{}', null);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: '{}',
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) continue;
      const json = await res.json();
      const token = json?.data?.token || json?.token;
      if (token) {
        activeHostIdx = idx;
        mbSessionToken = token;
        mbSessionExpiry = Date.now() + 6 * 3600 * 1000;
        return token;
      }
    } catch {
      // Try next host in pool
    }
  }
  console.warn('[MovieBox Auth] Upstream token unavailable; operating in unified fallback mode.');
  return null;
}

async function movieBoxRequest(method, pathAndQuery, bodyObj = null) {
  if (method === 'GET' && pathAndQuery.startsWith('/wefeed-mobile-bff/subject-api/get?')) {
    const cached = detailsCache.get(pathAndQuery);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  let token = null;
  try {
    token = await ensureMovieBoxToken(false);
  } catch {
    token = null;
  }
  if (!token) return null;

  const bodyStr = bodyObj != null ? JSON.stringify(bodyObj) : null;
  const maxAttempts = IS_VERCEL ? 1 : 2;
  const maxHostsToTry = IS_VERCEL ? 2 : MOVIEBOX_HOSTS.length;
  const timeoutMs = IS_VERCEL ? 2200 : 6000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (let i = 0; i < maxHostsToTry; i++) {
      const idx = (activeHostIdx + i) % MOVIEBOX_HOSTS.length;
      const host = MOVIEBOX_HOSTS[idx];
      const url = `${host}${pathAndQuery}`;
      try {
        const headers = buildMovieBoxSignedHeaders(method, url, bodyStr, token);
        const res = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(timeoutMs)
        });

        // Absorb x-user token if returned
        const xUser = res.headers.get('x-user');
        if (xUser) {
          try {
            const parsedUser = JSON.parse(xUser);
            if (parsedUser.token) mbSessionToken = parsedUser.token;
          } catch {}
        }

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          try { token = await ensureMovieBoxToken(true); } catch { token = null; }
          break;
        }
        if (!res.ok) continue;

        const json = await res.json();
        // MovieBox returns { code: 406, message: "find no content" } when device_id/gaid is rate-limited
        if (json && json.code !== undefined && json.code !== 0) {
          try { token = await ensureMovieBoxToken(true); } catch { token = null; }
          break;
        }

        activeHostIdx = idx;
        const resultData = json.data !== undefined ? json.data : json;
        if (method === 'GET' && pathAndQuery.startsWith('/wefeed-mobile-bff/subject-api/get?') && resultData) {
          detailsCache.set(pathAndQuery, { data: resultData, expiresAt: Date.now() + 15 * 60 * 1000 });
        }
        return resultData;
      } catch {
        // Continue to next host
      }
    }
  }
  return null;
}

function isDeprecationNoticeUrl(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.includes('1c7de0bd3393702d9191801f15f88f8d') ||
         lower.includes('9a0461bc39da389663bf3dbb17091d3f') ||
         lower.includes('b164fbfb4347792950bdfbfb563d39d9') ||
         lower.includes('80da52722ee7de7a4303290af6783424') ||
         lower.includes('/notice.mp4') ||
         (lower.includes('macdn.aoneroom.com') && lower.includes('/other/'));
}

function resolveDashBaseFromCookie(signCookie) {
  if (!signCookie) return null;
  for (const part of signCookie.split(';')) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf('urlprefix=');
    if (idx >= 0) {
      const prefixPart = trimmed.slice(idx + 'urlprefix='.length);
      const b64Token = prefixPart.split(':')[0].trim().replace(/-/g, '+').replace(/_/g, '/');
      try {
        const decoded = Buffer.from(b64Token, 'base64').toString('utf8').replace(/[\*\/]+$/, '');
        if (decoded.startsWith('http') && decoded.includes('/dash/')) {
          return decoded;
        }
      } catch {}
    }
  }
  return null;
}

function formatDubLabel(rawLanName, rawLanCode, isOriginal) {
  let clean = String(rawLanName || '').trim();
  const code = String(rawLanCode || '').trim().toLowerCase();
  const codeMap = {
    en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
    ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi',
    ko: 'Korean', ja: 'Japanese', es: 'Spanish', fr: 'French', zh: 'Chinese'
  };
  if (!clean || clean.toLowerCase() === 'audio' || clean.toLowerCase() === 'original' || clean.toLowerCase() === 'original audio') {
    const mappedLang = codeMap[code] || (code ? code.toUpperCase() : 'Original');
    return isOriginal ? `${mappedLang} (Original)` : `${mappedLang} Audio`;
  }
  // Normalize e.g. "Hindi dub" -> "Hindi Dub" without duplicating "Dub"
  clean = clean.replace(/\bdub\b/gi, 'Dub').replace(/\baudio\b/gi, 'Audio').trim();
  if (isOriginal && !/original/i.test(clean)) {
    clean = `${clean.replace(/\s*Dub$/i, '')} (Original)`;
  } else if (!isOriginal && !/dub|audio|original/i.test(clean)) {
    clean = `${clean} Dub`;
  }
  return clean;
}

function mapMovieBoxSubject(s) {
  if (!s) return null;
  const subjectId = String(s.subjectId || s.id || '');
  if (!subjectId) return null;

  const stype = Number(s.subjectType || s.stype || 1);
  const type = stype === 2 ? 'series' : 'movie';
  const rawTitle = s.title || s.name || 'Untitled';
  const cleanTitle = rawTitle.replace(/\s*\[[^\]]+\]\s*/g, '').trim() || rawTitle;
  const yearMatch = String(s.releaseDate || s.year || '2026').match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? yearMatch[1] : '2026';
  const poster = s.cover?.url || s.coverUrl || s.poster || s.pic || '';
  const backdrop = (Array.isArray(s.stills) && s.stills[0]?.url) || s.preVideoCover?.url || poster;
  const rawRate = Number(s.imdbRatingValue || s.imdbRate || s.rate || 0);
  const rating = rawRate > 0 ? rawRate.toFixed(1) : '8.2';
  const genres = typeof s.genre === 'string'
    ? s.genre.split(',').map(g => g.trim()).filter(Boolean)
    : (Array.isArray(s.genre) ? s.genre : ['Drama']);

  const bracketMatch = rawTitle.match(/\[([^\]]+)\]/);
  const bracketTag = bracketMatch ? bracketMatch[1].trim() : '';

  const dubs = Array.isArray(s.dubs)
    ? s.dubs.map(d => {
        const formatted = formatDubLabel(d.lanName || d.language, d.lanCode, !!d.original);
        return {
          subjectId: String(d.subjectId || d.id || ''),
          lanName: formatted,
          label: formatted,
          lanCode: String(d.lanCode || 'en').toLowerCase(),
          original: !!d.original
        };
      }).filter(d => d.subjectId)
    : [];

  let audioSummary = '';
  if (dubs.length > 1) {
    const names = dubs.map(d => d.lanName.replace(/\s*\(Original\)|\s*Dub|\s*Audio/gi, '').trim());
    audioSummary = `Multi-Audio (${[...new Set(names)].slice(0, 4).join(', ')})`;
  } else if (dubs.length === 1) {
    audioSummary = dubs[0].lanName;
  } else if (bracketTag) {
    audioSummary = `${bracketTag} Audio`;
  } else if (s.subtitles) {
    audioSummary = `Original Audio • Subtitles: ${String(s.subtitles).split(',').slice(0, 3).join(', ')}`;
  } else {
    audioSummary = 'Original Stereo & 5.1 Audio';
  }

  const audioBadge = dubs.length > 1
    ? `${dubs.length} Audio Tracks`
    : (bracketTag ? `${bracketTag} Audio` : 'Original Audio');

  const rawDesc = String(s.description || s.intro || '').trim();
  const description = rawDesc ||
    `${cleanTitle} (${year}) is a ${genres.slice(0, 3).join(', ')} ${type === 'series' ? 'series' : 'feature film'} rated ${rating} on IMDb. Stream in adaptive 1080p Full HD, 720p HD, or 480p SD with selectable audio and subtitles.`;

  return {
    id: `mb_${subjectId}`,
    subjectId,
    provider: 'MovieBox CDN',
    providerKind: 'moviebox',
    title: rawTitle,
    cleanTitle,
    year,
    rating,
    type,
    stype,
    poster,
    backdrop,
    genres,
    durationSeconds: Number(s.durationSeconds || s.duration || 0),
    quality: '1080p Full HD',
    badges: [
      '1080p Full HD',
      audioBadge,
      type === 'series' ? 'TV Series' : 'Feature Film'
    ],
    dubs,
    languages: audioSummary,
    description
  };
}


// ============================================================================
// 2. 4KHDHUB NATIVE CLIENT & HUBCLOUD STREAM RESOLVER
// ============================================================================
const FOURK_BASE = process.env.MOVIEBOX_FOURKHDHUB_URL || 'https://4khdhub.one';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function search4KHdHub(query) {
  try {
    const url = `${FOURK_BASE}/?s=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const cardRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*movie-card[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const href = match[1];
      const inner = match[2];
      const titleMatch = inner.match(/class="[^"]*movie-card-title[^"]*"[^>]*>([^<]+)</i);
      const metaMatch = inner.match(/class="[^"]*movie-card-meta[^"]*"[^>]*>([^<]+)</i);
      const imgMatch = inner.match(/<img[^>]+src="([^"]+)"/i);
      if (!titleMatch) continue;
      const title = titleMatch[1].trim();
      const meta = metaMatch ? metaMatch[1].trim() : '';
      const yearMatch = meta.match(/\b(19\d\d|20\d\d)\b/);
      const poster = imgMatch ? imgMatch[1] : '';
      const slugPath = href.startsWith('http') ? new URL(href).pathname : href;

      results.push({
        id: `4k_${Buffer.from(slugPath).toString('base64url')}`,
        fourkPath: slugPath,
        provider: '4KHDHub 2160p',
        providerKind: 'fourkhdhub',
        title,
        cleanTitle: title,
        year: yearMatch ? yearMatch[1] : '2025',
        rating: '8.7',
        type: slugPath.includes('-series-') ? 'series' : 'movie',
        poster,
        backdrop: poster,
        quality: '4K 2160p Atmos',
        badges: ['4K 2160p', 'Dolby Atmos', '4KHDHub'],
        genres: ['4K UHD', 'Dolby Atmos'],
        languages: 'Multi-Audio (Hindi • English)',
        description: `${title} — Direct 4K 2160p & 1080p BluRay/WEB-DL streams from 4KHDHub.`
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ============================================================================
// 3. LOCAL D:\HOME THEATER SCANNER & VLC / MPV LAUNCHER
// ============================================================================
const VLC_PATHS = [
  process.env.MOVIEBOX_VLC_PATH,
  'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
  'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'
].filter(Boolean);

function getVlcPath() {
  for (const p of VLC_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return 'vlc';
}

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {}
  return fallback;
}

function writeJsonSafe(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function parseMediaFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext);
  const tokens = base.split(/[._\-]+/);

  let year = null;
  let yearIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/^(19\d\d|20\d\d)$/.test(tokens[i])) {
      year = tokens[i];
      yearIndex = i;
      break;
    }
  }

  const titleTokens = yearIndex > 0 ? tokens.slice(0, yearIndex) : tokens.slice(0, 4);
  const cleanTitle = titleTokens.join(' ').replace(/\bSpider Man\b/i, 'Spider-Man');
  const upper = base.toUpperCase();
  const quality = upper.includes('2160P') || upper.includes('4K') ? '4K UHD (2160p)' :
                  upper.includes('1080P') ? '1080p FHD' : 'HD';

  const badges = [quality];
  if (upper.includes('ATMOS')) badges.push('Dolby Atmos');
  if (upper.includes('DDP5') || upper.includes('DDP')) badges.push('DDP 5.1');
  if (upper.includes('MULTI')) badges.push('Multi-Audio');
  if (upper.includes('H.265') || upper.includes('H265') || upper.includes('HEVC')) badges.push('HEVC H.265');

  return {
    cleanTitle: cleanTitle || base,
    year: year || '2026',
    quality,
    badges,
    provider: upper.includes('4KHDHUB') ? '4KHDHub Local Disk' : 'Local Home Theater'
  };
}

function scanLocalMedia() {
  const videoExtensions = new Set(['.mkv', '.mp4', '.webm', '.avi', '.mov', '.m4v']);
  const results = [];

  function scanDir(dirPath, depth = 0) {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'ui') continue;
        scanDir(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (videoExtensions.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            const parsed = parseMediaFilename(entry.name);
            const sizeGB = (stat.size / (1024 * 1024 * 1024)).toFixed(2);
            results.push({
              id: 'local_' + Buffer.from(fullPath).toString('base64url'),
              title: parsed.cleanTitle,
              cleanTitle: parsed.cleanTitle,
              rawFilename: entry.name,
              fullPath,
              sizeBytes: stat.size,
              sizeFormatted: `${sizeGB} GB`,
              year: parsed.year,
              quality: parsed.quality,
              badges: parsed.badges,
              provider: parsed.provider,
              providerKind: 'local',
              type: 'movie',
              isLocal: true,
              ext: ext.replace('.', '').toUpperCase(),
              streamUrl: `/api/local-stream?path=${encodeURIComponent(fullPath)}`,
              poster: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=800&q=85',
              backdrop: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=1920&q=85',
              rating: '9.1',
              maturity: 'U/A 13+',
              genres: ['Action', 'Sci-Fi', 'Local 4K Vault'],
              languages: 'English • Hindi • Tamil • Telugu (Multi-Audio DDP 5.1 Atmos)',
              description: `Direct ${parsed.quality} Home Theater master (${sizeGB} GB) stored on local disk. Stream immediately in the built-in Studio Player or launch in VLC Media Player for full Dolby Atmos 5.1 surround decode.`
            });
          } catch {}
        }
      }
    }
  }

  scanDir(HOME_THEATER_DIR, 0);
  return results;
}

function getDefaultUiData() {
  return {
    watchlist: [],
    likes: [],
    ambientMode: true,
    customIptv: [
      {
        id: 'iptv_nasa',
        name: 'NASA TV UHD Live',
        category: 'Science & Space',
        language: 'English',
        quality: '1080p60 LIVE',
        logo: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80',
        streamUrl: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8'
      },
      {
        id: 'iptv_redbull',
        name: 'Red Bull TV Sports Live',
        category: 'Live Sports',
        language: 'English',
        quality: '1080p LIVE',
        logo: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=600&q=80',
        streamUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8'
      },
      {
        id: 'iptv_dw',
        name: 'DW Global News 24/7',
        category: 'Live News',
        language: 'English',
        quality: '1080p LIVE',
        logo: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=600&q=80',
        streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8'
      }
    ]
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.vtt': 'text/vtt; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Convert SRT subtitle text to WebVTT for HTML5 <video><track>
function srtToVtt(srtText) {
  const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const vttBody = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${vttBody}\n`;
}

// ============================================================================
// 4. HTTP SERVER & MOVIEBOX / 4KHDHUB / LOCAL / VLC ENDPOINTS
// ============================================================================
async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  // 1. Robust URL resolution for Vercel Serverless, Cloud proxies & local Node HTTP
  const forwardedProto = req.headers['x-forwarded-proto'] || (IS_VERCEL ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  
  // Vercel populates x-forwarded-uri or x-matched-path with the original incoming request URI
  const forwardedUri = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'];
  let rawUrl = forwardedUri || req.url;
  
  const parsedUrl = new URL(rawUrl, `${forwardedProto}://${host}`);
  let pathname = parsedUrl.pathname;

  // Handle Vercel rewrite parameter or catch-all serverless query
  if (parsedUrl.searchParams.has('__api_path')) {
    pathname = '/api/' + parsedUrl.searchParams.get('__api_path').replace(/^\/+/, '');
  } else if (pathname === '/api/index.js' || pathname === '/api' || pathname.startsWith('/api/[')) {
    if (req.query && req.query.__api_path) {
      pathname = '/api/' + String(req.query.__api_path).replace(/^\/+/, '');
    } else if (req.query && Array.isArray(req.query.slug)) {
      pathname = '/api/' + req.query.slug.join('/');
    } else if (forwardedUri) {
      try {
        pathname = new URL(forwardedUri, 'http://localhost').pathname;
      } catch {}
    }
  }

  // Normalize duplicate slashes e.g. //api///moviebox/home -> /api/moviebox/home
  pathname = pathname.replace(/\/+/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // --------------------------------------------------------------------------
  // A00. GET /manifest.json — PWA Web App Manifest for Phones, iPads & TVs
  // --------------------------------------------------------------------------
  if (pathname === '/manifest.json' && req.method === 'GET') {
    return sendJson(res, 200, {
      name: 'MovieBox Studio',
      short_name: 'MovieBox',
      description: 'Home Theater & Cloud Streaming Studio for Phone, iPad, Desktop & Smart TV',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#07090e',
      theme_color: '#07090e',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    });
  }

  // --------------------------------------------------------------------------
  // A0. GET /api/network-info — Local LAN IPv4 addresses or Vercel Cloud Edge
  // --------------------------------------------------------------------------
  if (pathname === '/api/network-info' && req.method === 'GET') {
    if (IS_VERCEL) {
      const host = req.headers.host || 'moviebox.vercel.app';
      const cloudUrl = `https://${host}`;
      return sendJson(res, 200, {
        ok: true,
        port: 443,
        hostname: 'Vercel Cloud Edge',
        isCloud: true,
        primaryUrl: cloudUrl,
        localUrl: cloudUrl,
        addresses: [
          {
            name: 'Vercel Global Edge (Anywhere on Phone)',
            address: 'Cloud',
            url: cloudUrl
          }
        ]
      });
    }

    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const [name, list] of Object.entries(interfaces)) {
      for (const iface of list || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({
            name,
            address: iface.address,
            url: `http://${iface.address}:${PORT}`
          });
        }
      }
    }
    // Sort preferred Wi-Fi / LAN ranges (192.168.x.x, 10.x.x.x, 172.x.x.x) first
    addresses.sort((a, b) => {
      const aScore = a.address.startsWith('192.168.') ? 0 : (a.address.startsWith('10.') ? 1 : 2);
      const bScore = b.address.startsWith('192.168.') ? 0 : (b.address.startsWith('10.') ? 1 : 2);
      return aScore - bScore;
    });
    const primaryUrl = addresses[0]?.url || `http://localhost:${PORT}`;
    return sendJson(res, 200, {
      ok: true,
      port: PORT,
      hostname: os.hostname(),
      primaryUrl,
      localUrl: `http://localhost:${PORT}`,
      addresses
    });
  }

  // --------------------------------------------------------------------------
  // A. GET /api/state — Local files + MovieBox-TUI history.json + Config
  // --------------------------------------------------------------------------
  if (pathname === '/api/state' && req.method === 'GET') {
    const localMedia = scanLocalMedia();
    const tuiConfig = readJsonSafe(TUI_CONFIG_FILE, {
      active_provider: 'moviebox',
      moviebox_enabled: true,
      fourkhdhub_enabled: true,
      default_player: 'vlc'
    });
    const tuiHistory = readJsonSafe(TUI_HISTORY_FILE, { watched: [], recent: [] });
    const tuiAddons = readJsonSafe(TUI_ADDONS_FILE, []);
    const uiData = readJsonSafe(UI_DATA_FILE, getDefaultUiData());

    return sendJson(res, 200, {
      ok: true,
      system: {
        homeTheaterDir: HOME_THEATER_DIR,
        appDir: APP_DIR,
        vlcPath: getVlcPath(),
        vlcInstalled: fs.existsSync(getVlcPath()),
        movieboxHost: MOVIEBOX_HOSTS[activeHostIdx],
        tuiConfigPath: TUI_CONFIG_FILE,
        isCloud: IS_VERCEL,
        cloudHost: req.headers.host || ''
      },
      localMedia,
      tuiConfig,
      tuiHistory,
      tuiAddons,
      uiData
    });
  }

  // --------------------------------------------------------------------------
  // A1. GET /api/gaiaflix/catalog — Real-time GaiaFlix.live Channels & Live Sports Feed
  // --------------------------------------------------------------------------
  if ((pathname === '/api/gaiaflix/catalog' || pathname === '/gaiaflix/catalog' || pathname === '/api/gaiaflix/channels' || pathname === '/gaiaflix/channels') && req.method === 'GET') {
    try {
      if (gaiaflixCache.data && Date.now() < gaiaflixCache.expiresAt && !parsedUrl.searchParams.get('refresh')) {
        return sendJson(res, 200, gaiaflixCache.data);
      }

      let rawJson = null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const upstream = await fetch('https://bintvjson.lovable.app/api/public/bintvjson', {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
          },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (upstream.ok) {
          rawJson = await upstream.json();
        }
      } catch (e) {
        console.warn('GaiaFlix upstream fetch warning:', e.message);
      }

      if (!rawJson) {
        if (gaiaflixCache.data) return sendJson(res, 200, gaiaflixCache.data);
        rawJson = { 'Live Events': [], 'Upcoming Events': [], '24/7 Channels': [] };
      }

      const rawLive = Array.isArray(rawJson['Live Events']) ? rawJson['Live Events'] : [];
      const rawUpcoming = Array.isArray(rawJson['Upcoming Events']) ? rawJson['Upcoming Events'] : [];
      const rawChannels = Array.isArray(rawJson['24/7 Channels']) ? rawJson['24/7 Channels'] : [];

      const liveEvents = rawLive.map((item, idx) => {
        const streams = (Array.isArray(item.streams) ? item.streams : []).map((s, sIdx) => {
          const direct = decodeGaiaStreamUrl(s.url);
          return {
            id: `stream_${sIdx + 1}`,
            name: s.name || `Live Stream ${sIdx + 1}`,
            quality: '1080p60 LIVE',
            type: 'embed',
            directUrl: direct,
            embedUrl: s.url,
            streamUrl: direct || s.url,
            vlcUrl: direct || s.url
          };
        });
        const primaryStream = streams[0] || null;
        return {
          id: `gaia-live-${item.id || idx}`,
          originalId: item.id,
          name: item.name,
          title: item.name,
          cleanTitle: item.name,
          category: item.category || 'Live Sports',
          status: 'live',
          isLive: true,
          isGaiaFlix: true,
          feedType: 'live',
          badge: 'LIVE MATCH',
          year: 'LIVE',
          rating: 'LIVE',
          quality: '1080p60 LIVE',
          poster: item.poster ? String(item.poster).replace(/^http:/i, 'https:') : 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1280&q=80',
          backdrop: item.poster ? String(item.poster).replace(/^http:/i, 'https:') : 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1280&q=80',
          provider: 'GaiaFlix • Live Feed',
          streams,
          streamUrl: primaryStream?.streamUrl || '',
          vlcUrl: primaryStream?.vlcUrl || '',
          description: `Live sports coverage on GaiaFlix (${item.category || 'Sports'}). Real-time 60fps satellite & cable relay.`
        };
      });

      const upcomingEvents = rawUpcoming.map((item, idx) => {
        const streams = (Array.isArray(item.streams) ? item.streams : []).map((s, sIdx) => {
          const direct = decodeGaiaStreamUrl(s.url);
          return {
            id: `stream_${sIdx + 1}`,
            name: s.name || `Feed ${sIdx + 1}`,
            quality: 'HD FEED',
            type: 'embed',
            directUrl: direct,
            embedUrl: s.url,
            streamUrl: direct || s.url,
            vlcUrl: direct || s.url
          };
        });
        const primaryStream = streams[0] || null;
        return {
          id: `gaia-up-${item.id || idx}`,
          originalId: item.id,
          name: item.name,
          title: item.name,
          cleanTitle: item.name,
          category: item.category || 'Upcoming Sports',
          status: 'upcoming',
          isUpcoming: true,
          isGaiaFlix: true,
          feedType: 'upcoming',
          badge: 'UPCOMING FEED',
          year: 'SCHEDULED',
          rating: 'FEED',
          quality: 'HD FEED',
          poster: item.poster ? String(item.poster).replace(/^http:/i, 'https:') : 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1280&q=80',
          backdrop: item.poster ? String(item.poster).replace(/^http:/i, 'https:') : 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1280&q=80',
          provider: 'GaiaFlix • Upcoming Feed',
          streams,
          streamUrl: primaryStream?.streamUrl || '',
          vlcUrl: primaryStream?.vlcUrl || '',
          description: `Scheduled match on GaiaFlix (${item.category || 'Sports'}). Stream feeds activate at start time.`
        };
      });

      const channels = rawChannels.map((item, idx) => {
        const catInfo = categorizeGaiaChannel(item.name);
        const streams = (Array.isArray(item.streams) ? item.streams : []).map((s, sIdx) => {
          const direct = decodeGaiaStreamUrl(s.url);
          return {
            id: `stream_${sIdx + 1}`,
            name: s.name || item.name,
            quality: '1080p60 LIVE',
            type: 'embed',
            directUrl: direct,
            embedUrl: s.url,
            streamUrl: direct || s.url,
            vlcUrl: direct || s.url
          };
        });
        const primaryStream = streams[0] || null;
        return {
          id: `gaia-ch-${item.id || idx}`,
          originalId: item.id,
          name: item.name,
          title: item.name,
          cleanTitle: item.name,
          category: catInfo.genreLabel,
          genreKey: catInfo.genreKey,
          status: '24/7',
          isChannel: true,
          isLive: true,
          isGaiaFlix: true,
          feedType: 'channel',
          badge: '24/7 LIVE',
          year: '24/7',
          rating: 'LIVE',
          quality: '1080p60 LIVE',
          poster: item.poster ? String(item.poster).replace(/^http:/i, 'https:') : 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&w=1280&q=80',
          backdrop: item.poster ? String(item.poster).replace(/^http:/i, 'https:') : 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&w=1280&q=80',
          logo: item.poster ? String(item.poster).replace(/^http:/i, 'https:') : '',
          provider: `GaiaFlix • ${catInfo.genreLabel}`,
          streams,
          streamUrl: primaryStream?.streamUrl || '',
          vlcUrl: primaryStream?.vlcUrl || '',
          description: `24/7 continuous television broadcast on GaiaFlix (${item.name}). Multi-device streaming support.`
        };
      });

      const payload = {
        ok: true,
        source: 'gaiaflix.live',
        generatedAt: new Date().toISOString(),
        counts: {
          live: liveEvents.length,
          upcoming: upcomingEvents.length,
          channels: channels.length,
          total: liveEvents.length + upcomingEvents.length + channels.length
        },
        liveEvents,
        upcomingEvents,
        channels
      };

      gaiaflixCache = {
        data: payload,
        expiresAt: Date.now() + 45 * 1000
      };

      return sendJson(res, 200, payload);
    } catch (err) {
      console.error('GaiaFlix catalog fetch error:', err.message);
      if (gaiaflixCache.data) {
        return sendJson(res, 200, gaiaflixCache.data);
      }
      return sendJson(res, 500, { ok: false, error: 'Could not fetch GaiaFlix catalog: ' + err.message });
    }
  }

  // --------------------------------------------------------------------------
  // A2. GET /api/gaiaflix/player — Ad-Free Clean Stream Embed Wrapper
  // --------------------------------------------------------------------------
  if ((pathname === '/api/gaiaflix/player' || pathname === '/gaiaflix/player') && req.method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url') || parsedUrl.searchParams.get('stream') || parsedUrl.searchParams.get('target') || parsedUrl.searchParams.get('streamUrl') || '';
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Invalid or missing stream URL');
    }
    const cleanEmbed = decodeGaiaStreamUrl(targetUrl);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Live Stream Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #07090e; overflow: hidden; position: relative; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
    .stream-bar {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 100;
      display: flex;
      gap: 6px;
      opacity: 0.85;
      transition: opacity 0.2s;
    }
    .stream-bar:hover { opacity: 1; }
    .stream-btn {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  </style>
</head>
<body>
  <div class="stream-bar">
    <button class="stream-btn" onclick="location.reload()">Reload Feed</button>
    <a class="stream-btn" href="${cleanEmbed.replace(/"/g, '&quot;')}" target="_blank" rel="noreferrer">Open Direct</a>
  </div>
  <iframe src="${cleanEmbed.replace(/"/g, '&quot;')}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-downloads"></iframe>
</body>
</html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(html);
  }

  // --------------------------------------------------------------------------
  // A3. GET /api/netmirror/catalog — Verified NetMirror Originals & Curated Hits
  // --------------------------------------------------------------------------
  if ((pathname === '/api/netmirror/catalog' || pathname === '/netmirror/catalog') && req.method === 'GET') {
    try {
      const filter = parsedUrl.searchParams.get('filter') || 'all';
      if (netmirrorCache.data && Date.now() < netmirrorCache.expiresAt && filter === 'all' && !parsedUrl.searchParams.get('refresh')) {
        return sendJson(res, 200, netmirrorCache.data);
      }

      // Ensure homeCache is populated so we have high-speed MovieBox CDN subjects
      let homeData = homeCache.data;
      if (!homeData || Date.now() >= homeCache.expiresAt) {
        try {
          const raw = await movieBoxRequest('GET', '/wefeed-mobile-bff/tab-operating?page=1&tabId=0&version=');
          const rawGroups = raw?.items || [];
          const banners = [];
          const top10Movies = [];
          const top10Series = [];
          const rows = [];
          for (const g of rawGroups) {
            const gTitle = String(g.title || 'Featured').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim() || 'Featured';
            const gType = g.type || '';
            if (gType === 'BANNER' && Array.isArray(g.banner?.banners)) {
              for (const b of g.banner.banners) {
                const subj = mapMovieBoxSubject(b.subject);
                if (subj) banners.push(subj);
              }
            } else if (gType === 'RANKING_LIST_MULTI_TAB' && Array.isArray(g.rankingListData?.items)) {
              for (const rankTab of g.rankingListData.items) {
                const mapped = (rankTab.subjects || []).map(mapMovieBoxSubject).filter(Boolean);
                if (gTitle.toLowerCase().includes('movie') && top10Movies.length === 0) top10Movies.push(...mapped);
                else if ((gTitle.toLowerCase().includes('series') || gTitle.toLowerCase().includes('tv')) && top10Series.length === 0) top10Series.push(...mapped);
              }
            } else {
              let rawList = Array.isArray(g.subjects) ? g.subjects : (Array.isArray(g.customData?.items) ? g.customData.items.map(ci => ci.subject).filter(Boolean) : []);
              const mapped = rawList.map(mapMovieBoxSubject).filter(Boolean);
              if (mapped.length >= 3) {
                rows.push({ title: gTitle, category: gTitle.toLowerCase().includes('series') ? 'series' : 'movies', items: mapped });
              }
            }
          }
          homeData = { ok: true, banners, top10Movies, top10Series, rows };
          homeCache = { data: homeData, expiresAt: Date.now() + 10 * 60 * 1000 };
        } catch {}
      }

      const verifiedSeeds = [
        { title: 'Stranger Things', badge: 'NETFLIX ORIGINAL', year: '2025', rating: '8.7', genres: ['Sci-Fi', 'Horror', 'Drama'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Wednesday', badge: 'NETFLIX ORIGINAL', year: '2024', rating: '8.1', genres: ['Fantasy', 'Comedy', 'Mystery'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Squid Game', badge: 'NETFLIX ORIGINAL', year: '2025', rating: '8.0', genres: ['Action', 'Thriller', 'Drama'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80' },
        { title: 'One Piece', badge: 'NETFLIX ORIGINAL', year: '2024', rating: '8.3', genres: ['Action', 'Adventure', 'Fantasy'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1280&q=80' },
        { title: 'The Witcher', badge: 'NETFLIX ORIGINAL', year: '2024', rating: '8.1', genres: ['Action', 'Adventure', 'Fantasy'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Berlin', badge: 'NETFLIX ORIGINAL', year: '2024', rating: '7.9', genres: ['Action', 'Crime', 'Drama'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Black Mirror', badge: 'NETFLIX ORIGINAL', year: '2025', rating: '8.7', genres: ['Sci-Fi', 'Thriller', 'Drama'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Arcane', badge: 'NETFLIX ORIGINAL', year: '2024', rating: '9.0', genres: ['Animation', 'Action', 'Sci-Fi'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Dune: Part Two', badge: 'NETMIRROR 4K', year: '2024', rating: '8.6', genres: ['Sci-Fi', 'Action', 'Adventure'], type: 'movie', stype: 1, poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Oppenheimer', badge: 'NETMIRROR 4K', year: '2023', rating: '8.9', genres: ['Biography', 'Drama', 'History'], type: 'movie', stype: 1, poster: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1280&q=80' },
        { title: 'Loki', badge: 'DISNEY+ EXCLUSIVE', year: '2024', rating: '8.2', genres: ['Action', 'Adventure', 'Fantasy'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1280&q=80' },
        { title: 'The Boys', badge: 'PRIME EXCLUSIVE', year: '2024', rating: '8.7', genres: ['Action', 'Comedy', 'Crime'], type: 'series', stype: 2, poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80', backdrop: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1280&q=80' }
      ];

      const catalog = [];
      const seenIds = new Set();

      if (homeData) {
        const pool = [
          ...(homeData.top10Series || []),
          ...(homeData.top10Movies || []),
          ...(homeData.banners || [])
        ];
        for (const item of pool) {
          if (!item || !item.subjectId || seenIds.has(item.subjectId)) continue;
          seenIds.add(item.subjectId);
          catalog.push({
            ...item,
            id: `nm_${item.subjectId}`,
            provider: 'NetMirror CDN',
            badge: (item.type === 'series' || Number(item.stype) === 2) ? 'NETFLIX ORIGINAL' : 'NETMIRROR 4K',
            quality: '1080p Full HD'
          });
        }
      }

      for (const seed of verifiedSeeds) {
        const already = catalog.some(c => c.cleanTitle?.toLowerCase() === seed.title.toLowerCase() || c.title?.toLowerCase() === seed.title.toLowerCase());
        if (!already) {
          catalog.push({
            id: `nm_seed_${seed.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            subjectId: '',
            title: seed.title,
            cleanTitle: seed.title,
            year: seed.year,
            rating: seed.rating,
            genres: seed.genres,
            type: seed.type,
            stype: seed.stype,
            badge: seed.badge,
            quality: '1080p Full HD',
            provider: 'NetMirror CDN',
            poster: seed.poster,
            backdrop: seed.backdrop,
            description: `Stream ${seed.title} in pristine 1080p Full HD with spatial audio on NetMirror CDN.`
          });
        }
      }

      const payload = {
        ok: true,
        source: 'netmirror.app',
        count: catalog.length,
        items: catalog
      };

      netmirrorCache = {
        data: payload,
        expiresAt: Date.now() + 15 * 60 * 1000
      };

      return sendJson(res, 200, payload);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message, items: [] });
    }
  }

  // --------------------------------------------------------------------------
  // A4. GET /api/netmirror/search?q=... — NetMirror Live Search
  // --------------------------------------------------------------------------
  if ((pathname === '/api/netmirror/search' || pathname === '/netmirror/search') && req.method === 'GET') {
    const q = (parsedUrl.searchParams.get('q') || '').trim();
    if (!q) return sendJson(res, 200, { ok: true, results: [] });

    try {
      const mbData = await movieBoxRequest('POST', '/wefeed-mobile-bff/subject-api/search/v2', {
        keyword: q,
        page: 1,
        perPage: 24,
        subjectType: 0
      });
      const rawList = mbData?.items || mbData?.subjects || [];
      const results = rawList.map(mapMovieBoxSubject).filter(Boolean).map(item => ({
        ...item,
        id: `nm_${item.subjectId || item.id}`,
        provider: 'NetMirror CDN',
        badge: (item.type === 'series' || Number(item.stype) === 2) ? 'NETFLIX ORIGINAL' : 'NETMIRROR 4K',
        quality: item.quality || '1080p Full HD'
      }));
      return sendJson(res, 200, { ok: true, query: q, count: results.length, results });
    } catch (err) {
      return sendJson(res, 200, { ok: false, error: err.message, results: [] });
    }
  }

  // --------------------------------------------------------------------------
  // B. GET /api/moviebox/home — LIVE MovieBox Homepage (Banners + All Rows!)
  // --------------------------------------------------------------------------
  if (pathname === '/api/moviebox/home' && req.method === 'GET') {
    try {
      if (homeCache.data && Date.now() < homeCache.expiresAt && !parsedUrl.searchParams.get('refresh')) {
        return sendJson(res, 200, homeCache.data);
      }

      const unifiedBase = getUnifiedHomeData();
      let liveData = null;

      try {
        liveData = await movieBoxRequest('GET', '/wefeed-mobile-bff/tab-operating?page=1&tabId=0&version=');
      } catch (e) {
        console.warn('[Home Feed] Upstream MovieBox fetch non-fatal fallback:', e.message);
      }

      if (liveData && Array.isArray(liveData.items) && liveData.items.length > 0) {
        const rawGroups = liveData.items;
        const banners = [];
        const top10Movies = [];
        const top10Series = [];
        const rows = [];

        for (const g of rawGroups) {
          const gTitle = String(g.title || 'Featured').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim() || 'Featured';
          const gType = g.type || '';

          // 1. Extract Hero Banners
          if (gType === 'BANNER' && Array.isArray(g.banner?.banners)) {
            for (const b of g.banner.banners) {
              const subj = mapMovieBoxSubject(b.subject);
              if (subj) {
                subj.backdrop = b.image?.url || subj.backdrop;
                subj.ribbon = 'PREMIERE';
                banners.push(subj);
              }
            }
            continue;
          }

          // 2. Extract Ranking Lists (Trending Movies / Trending TV Series)
          if (gType === 'RANKING_LIST_MULTI_TAB' && Array.isArray(g.rankingListData?.items)) {
            for (const rankTab of g.rankingListData.items) {
              const mapped = (rankTab.subjects || []).map(mapMovieBoxSubject).filter(Boolean);
              if (gTitle.toLowerCase().includes('movie') && top10Movies.length === 0) {
                top10Movies.push(...mapped);
              } else if (gTitle.toLowerCase().includes('series') || gTitle.toLowerCase().includes('tv')) {
                if (top10Series.length === 0) top10Series.push(...mapped);
              }
              if (mapped.length > 0) {
                rows.push({
                  title: `${gTitle} — ${rankTab.title || 'Top Ranked'}`,
                  category: gTitle.toLowerCase().includes('series') ? 'series' : 'movies',
                  items: mapped
                });
              }
            }
            continue;
          }

          // 3. Extract Standard Subject Groups & Custom Groups
          let rawList = [];
          if (Array.isArray(g.subjects) && g.subjects.length > 0) {
            rawList = g.subjects;
          } else if (Array.isArray(g.customData?.items) && g.customData.items.length > 0) {
            rawList = g.customData.items.map(ci => ci.subject).filter(Boolean);
          }

          const mappedItems = rawList.map(mapMovieBoxSubject).filter(Boolean);
          if (mappedItems.length >= 3) {
            const lower = gTitle.toLowerCase();
            const cat = lower.includes('anime') ? 'anime' :
                        (lower.includes('tv') || lower.includes('series') || lower.includes('drama') ? 'series' : 'movies');
            rows.push({
              title: gTitle,
              category: cat,
              items: mappedItems
            });
          }
        }

        // Enrich top 4 Hero Banners with real descriptions, dubs, and ratings
        await Promise.allSettled(
          banners.slice(0, 4).map(async (b) => {
            try {
              const det = await movieBoxRequest('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(b.subjectId)}`);
              if (!det) return;
              const enriched = mapMovieBoxSubject(det);
              if (!enriched) return;
              if (det.description || det.intro) b.description = det.description || det.intro;
              if (enriched.dubs && enriched.dubs.length > 0) b.dubs = enriched.dubs;
              if (enriched.languages) b.languages = enriched.languages;
              if (enriched.rating) b.rating = enriched.rating;
              if (enriched.year) b.year = enriched.year;
              if (enriched.genres && enriched.genres.length) b.genres = enriched.genres;
              if (enriched.badges && enriched.badges.length) b.badges = enriched.badges;
              if (det.durationSeconds) b.durationSeconds = Number(det.durationSeconds);
            } catch {}
          })
        );

        // Splice in Unified Bollywood (HDHub4u & Vegamovies), Anime & Live TV rails
        const bollyRow = unifiedBase.rows.find(r => r.title.includes('Bollywood'));
        const animeRow = unifiedBase.rows.find(r => r.title.includes('Anime'));
        const sportsRow = unifiedBase.rows.find(r => r.title.includes('Live Sports'));
        const tvRow = unifiedBase.rows.find(r => r.title.includes('24/7'));

        if (bollyRow) rows.splice(1, 0, bollyRow);
        if (animeRow) rows.splice(3, 0, animeRow);
        if (sportsRow) rows.push(sportsRow);
        if (tvRow) rows.push(tvRow);

        const payload = {
          ok: true,
          unified: true,
          host: MOVIEBOX_HOSTS[activeHostIdx],
          banners: banners.length > 0 ? banners : unifiedBase.banners,
          top10Movies: top10Movies.length > 0 ? top10Movies.slice(0, 10) : unifiedBase.top10Movies,
          top10Series: top10Series.length > 0 ? top10Series.slice(0, 10) : unifiedBase.top10Series,
          rows
        };
        homeCache = { data: payload, expiresAt: Date.now() + 10 * 60 * 1000 };
        return sendJson(res, 200, payload);
      }

      // Seamless fallback to unified catalog
      homeCache = { data: unifiedBase, expiresAt: Date.now() + 10 * 60 * 1000 };
      return sendJson(res, 200, unifiedBase);
    } catch (err) {
      console.warn('[Home Feed] Fallback exception handler:', err.message);
      return sendJson(res, 200, getUnifiedHomeData());
    }
  }

  // --------------------------------------------------------------------------
  // C. GET /api/search?q=... — LIVE Search across MovieBox + 4KHDHub + Local
  // --------------------------------------------------------------------------
  if ((pathname === '/api/search' || pathname === '/search' || pathname === '/api/moviebox/search' || pathname === '/moviebox/search') && req.method === 'GET') {
    const q = (parsedUrl.searchParams.get('q') || '').trim();
    if (!q) return sendJson(res, 200, { ok: true, results: [] });

    const localMatches = scanLocalMedia().filter(item =>
      item.title.toLowerCase().includes(q.toLowerCase()) ||
      item.rawFilename.toLowerCase().includes(q.toLowerCase())
    );

    const unifiedMatches = searchUnifiedCatalog(q);

    let mbItems = [];
    let fourkItems = [];

    try {
      const [mbSearchRes, fourkSearchRes] = await Promise.allSettled([
        movieBoxRequest('POST', '/wefeed-mobile-bff/subject-api/search/v2', {
          keyword: q,
          page: 1,
          perPage: 20,
          subjectType: 0
        }),
        search4KHdHub(q)
      ]);

      if (mbSearchRes.status === 'fulfilled' && mbSearchRes.value) {
        const payload = mbSearchRes.value;
        const subjects = payload?.results?.[0]?.subjects || payload?.list || [];
        for (const s of subjects) {
          const mapped = mapMovieBoxSubject(s);
          if (mapped) mbItems.push(mapped);
        }
      }
      if (fourkSearchRes.status === 'fulfilled') {
        fourkItems = fourkSearchRes.value || [];
      }
    } catch {}

    // Deduplicate results by title & year
    const seenTitles = new Set();
    const combined = [];
    for (const item of [...unifiedMatches, ...mbItems, ...localMatches, ...fourkItems]) {
      const key = `${(item.cleanTitle || item.title || '').toLowerCase()}_${item.year || ''}`;
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        combined.push(item);
      }
    }

    return sendJson(res, 200, {
      ok: true,
      query: q,
      counts: {
        unified: unifiedMatches.length,
        moviebox: mbItems.length,
        local: localMatches.length,
        fourkhdhub: fourkItems.length
      },
      results: combined
    });
  }

  // --------------------------------------------------------------------------
  // D. GET /api/moviebox/details?subjectId=... — Full Details, Dubs & Seasons
  // --------------------------------------------------------------------------
  if (pathname === '/api/moviebox/details' && req.method === 'GET') {
    const subjectId = parsedUrl.searchParams.get('subjectId');
    if (!subjectId) return sendJson(res, 400, { ok: false, error: 'Missing subjectId' });

    // 1. Check Unified Multi-Provider Catalog first!
    const unified = getUnifiedSubject(subjectId);
    if (unified) {
      const isSeries = unified.type === 'series' || unified.type === 'anime' || Number(unified.stype) === 2 || Number(unified.stype) === 3;
      const seasons = isSeries ? [
        {
          season: 1,
          maxEp: unified.totalEpisodes || 12,
          resolutions: ['4K Dolby Vision', '1080p Full HD', '720p HD']
        }
      ] : [];
      return sendJson(res, 200, {
        ok: true,
        subjectId: unified.subjectId || unified.id,
        title: unified.title,
        cleanTitle: unified.cleanTitle || unified.title,
        year: unified.year,
        rating: unified.rating,
        type: unified.type,
        stype: unified.stype,
        poster: unified.poster,
        backdrop: unified.backdrop,
        description: unified.description,
        genres: unified.genres || ['Action', 'Drama'],
        quality: unified.quality || '4K Ultra HD',
        provider: unified.provider || 'MovieBox Cloud',
        badge: unified.badge || 'HD',
        durationSeconds: unified.durationSeconds || 7200,
        seasons,
        dubs: [
          { subjectId: unified.subjectId || unified.id, lanName: 'English (Original)', label: 'English (Original)', lanCode: 'en', original: true },
          { subjectId: unified.subjectId || unified.id, lanName: 'Hindi (Dolby Atmos)', label: 'Hindi (Dolby Atmos)', lanCode: 'hi', original: false }
        ],
        details: unified
      });
    }

    try {
      const details = await movieBoxRequest('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(subjectId)}`);
      const stype = Number(details?.subjectType || details?.stype || 1);

      let seasons = [];
      if (stype === 2) {
        try {
          const seasonData = await movieBoxRequest('GET', `/wefeed-mobile-bff/subject-api/season-info?subjectId=${encodeURIComponent(subjectId)}`);
          seasons = (seasonData?.seasons || []).map(s => ({
            season: Number(s.se || 1),
            maxEp: Number(s.maxEp || (Array.isArray(s.episodeNumbers) ? s.episodeNumbers.length : 1)),
            resolutions: (s.resolutions || []).map(r => r.resolution)
          }));
        } catch {}
      }

      const mapped = mapMovieBoxSubject(details) || {};
      const dubs = (details?.dubs || []).map(d => {
        const formatted = formatDubLabel(d.lanName || d.language, d.lanCode, !!d.original);
        return {
          subjectId: String(d.subjectId || d.id || ''),
          lanName: formatted,
          label: formatted,
          lanCode: String(d.lanCode || 'en').toLowerCase(),
          original: !!d.original
        };
      }).filter(d => d.subjectId);

      // Ensure at least 1 audio track entry exists so the UI always displays the active audio track
      if (dubs.length === 0) {
        const bracketMatch = String(details?.title || '').match(/\[([^\]]+)\]/);
        const langTag = bracketMatch ? bracketMatch[1].trim() : 'Original';
        const fallbackLabel = `${langTag} (Original)`;
        dubs.push({
          subjectId: String(details?.subjectId || subjectId),
          lanName: fallbackLabel,
          label: fallbackLabel,
          lanCode: 'orig',
          original: true
        });
      }

      const cast = (details?.staffList || []).slice(0, 10).map(st => ({
        name: st.name,
        character: st.character || '',
        avatar: st.avatarUrl || ''
      }));

      const audioTypes = [
        { id: 'aac_stereo', label: 'AAC 2.0 Stereo (Original)', channels: '2.0', codec: 'AAC-LC', default: true },
        { id: 'ddp_surround', label: 'Dolby Surround 5.1 (Spatial)', channels: '5.1', codec: 'E-AC3 / Spatial', default: false },
        { id: 'vocal_clarity', label: 'Dialogue Clarity Boost', channels: '2.0', codec: 'Enhanced', default: false }
      ];

      return sendJson(res, 200, {
        ok: true,
        details: {
          ...mapped,
          subjectId: String(details?.subjectId || subjectId),
          title: details?.title || mapped?.title || 'Stream',
          cleanTitle: mapped?.cleanTitle || details?.title || 'Stream',
          description: details?.description || details?.intro || mapped?.description || 'MovieBox Cloud Streaming',
          year: (details?.releaseDate || mapped?.year || '2026').slice(0, 4),
          rating: mapped?.rating || '8.2',
          durationSeconds: Number(details?.durationSeconds || 7200),
          subtitlesLabel: details?.subtitles || '',
          seasons,
          dubs,
          audioTypes,
          cast
        }
      });
    } catch (err) {
      console.warn('[Details API Error]:', err?.message);
      return sendJson(res, 200, {
        ok: true,
        details: {
          subjectId,
          title: 'Stream',
          cleanTitle: 'Stream',
          description: 'MovieBox Multi-Provider Stream',
          year: '2026',
          rating: '8.2',
          durationSeconds: 7200,
          seasons: [],
          dubs: [{ subjectId, lanName: 'English (Original)', label: 'English (Original)', lanCode: 'en', original: true }],
          audioTypes: [{ id: 'aac_stereo', label: 'AAC 2.0 Stereo (Original)', channels: '2.0', codec: 'AAC-LC', default: true }],
          cast: []
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // E. GET /api/moviebox/streams?subjectId=...&se=0&ep=0 — Resolve Real Streams!
  // --------------------------------------------------------------------------
  if (pathname === '/api/moviebox/streams' && req.method === 'GET') {
    const subjectId = parsedUrl.searchParams.get('subjectId');
    let se = Number(parsedUrl.searchParams.get('se') || 0);
    let ep = Number(parsedUrl.searchParams.get('ep') || 0);

    if (!subjectId) return sendJson(res, 400, { ok: false, error: 'Missing subjectId' });

    // 1. Check Unified Multi-Provider Catalog first!
    const unified = getUnifiedSubject(subjectId);
    if (unified) {
      return sendJson(res, 200, {
        ok: true,
        subjectId: unified.subjectId || unified.id,
        requestedSubjectId: subjectId,
        se,
        ep,
        baseSizeBytes: 4294967296,
        qualityOptions: ['4K Ultra HD', '1080p Full HD', '720p HD', '480p SD'],
        audioTypes: [
          { id: 'orig', label: 'English (Original Audio)' },
          { id: 'dual', label: 'Hindi / Dual Audio (Dolby Atmos)' }
        ],
        streams: buildServerStreams(unified, se, ep),
        subtitles: [
          { id: '1', lang: 'en', label: 'English (Full Captions)', vttUrl: '' },
          { id: '2', lang: 'hi', label: 'Hindi', vttUrl: '' }
        ]
      });
    }

    try {
      const fetchPlayAndResource = async (targetId, targetSe, targetEp) => {
        // MovieBox play-info/v2 requires &se=0&ep=0 for Movies and &se=N&ep=M for Series
        const playPath = `/wefeed-mobile-bff/subject-api/play-info/v2?subjectId=${encodeURIComponent(targetId)}&se=${targetSe}&ep=${targetEp}`;

        const resPath = targetSe === 0 && targetEp === 0
          ? `/wefeed-mobile-bff/subject-api/resource?subjectId=${encodeURIComponent(targetId)}&page=1&perPage=20`
          : `/wefeed-mobile-bff/subject-api/resource?subjectId=${encodeURIComponent(targetId)}&se=${targetSe}&ep=${targetEp}&page=1&perPage=20`;

        return Promise.allSettled([
          movieBoxRequest('GET', playPath),
          movieBoxRequest('GET', resPath)
        ]);
      };

      let [playInfoRes, resourceRes] = await fetchPlayAndResource(subjectId, se, ep);
      let activeSubjectId = subjectId;

      const hasStreams = (pRes) =>
        pRes.status === 'fulfilled' &&
        Array.isArray(pRes.value?.streams) &&
        pRes.value.streams.some(st => Boolean(resolveDashBaseFromCookie(st.signCookie)) || Boolean(st.url && !isDeprecationNoticeUrl(st.url)));

      // Fallback 1: If Movie (se=0, ep=0) returned 0 valid streams, check if it's stored under se=1, ep=1 (or vice-versa)
      if (!hasStreams(playInfoRes)) {
        const altSe = (se === 0 && ep === 0) ? 1 : 0;
        const altEp = (se === 0 && ep === 0) ? 1 : 0;
        const [altPlay, altRes] = await fetchPlayAndResource(subjectId, altSe, altEp);
        if (hasStreams(altPlay)) {
          playInfoRes = altPlay;
          resourceRes = altRes;
          se = altSe;
          ep = altEp;
        }
      }

      // Fallback 2: If a specific regional dub entry has no direct streams yet, fall back to any available dub with streams
      let subjectDetails = null;
      if (!hasStreams(playInfoRes)) {
        try {
          subjectDetails = await movieBoxRequest('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(subjectId)}`);
          const stype = Number(subjectDetails?.subjectType || subjectDetails?.stype || 1);
          const targetSe = stype === 2 ? (se || 1) : 0;
          const targetEp = stype === 2 ? (ep || 1) : 0;
          const dubCandidates = [...(subjectDetails?.dubs || [])].sort((a, b) => (b.original ? 1 : 0) - (a.original ? 1 : 0));
          for (const d of dubCandidates) {
            const candId = String(d.subjectId || '');
            if (!candId || candId === String(subjectId)) continue;
            const [candPlay, candRes] = await fetchPlayAndResource(candId, targetSe, targetEp);
            if (hasStreams(candPlay)) {
              playInfoRes = candPlay;
              resourceRes = candRes;
              activeSubjectId = candId;
              se = targetSe;
              ep = targetEp;
              break;
            }
          }
        } catch {}
      }

      // Fallback 3: Rotate MovieBox session identity once if play-info/v2 was soft-throttled
      if (!hasStreams(playInfoRes)) {
        try {
          await ensureMovieBoxToken(true);
          const [retryPlay, retryRes] = await fetchPlayAndResource(activeSubjectId, se, ep);
          if (hasStreams(retryPlay)) {
            playInfoRes = retryPlay;
            resourceRes = retryRes;
          }
        } catch {}
      }

      const resolvedStreams = [];
      let primaryResourceId = null;

      const formatSizeLabel = (bytes) => {
        const b = Number(bytes || 0);
        if (b <= 0) return 'Adaptive';
        if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        return `${Math.max(1, Math.round(b / (1024 * 1024)))} MB`;
      };

      // Map exact per-resolution file sizes from /subject-api/resource list[]
      const exactResBytes = {};
      if (resourceRes.status === 'fulfilled' && Array.isArray(resourceRes.value?.list)) {
        for (const r of resourceRes.value.list) {
          if (r.resourceId && !primaryResourceId) {
            primaryResourceId = String(r.resourceId);
          }
          const resKey = String(r.resolution || '').replace(/\D/g, '');
          const rSize = Number(r.size || 0);
          if (resKey && rSize > 0 && (!exactResBytes[resKey] || rSize > exactResBytes[resKey])) {
            exactResBytes[resKey] = rSize;
          }
        }
      }

      let dashCombinedBytes = 0;
      if (playInfoRes.status === 'fulfilled' && Array.isArray(playInfoRes.value?.streams)) {
        for (const s of playInfoRes.value.streams) {
          if (Number(s.size) > dashCombinedBytes) dashCombinedBytes = Number(s.size);
        }
      }

      // Determine the 1080p reference byte size accurately (not the sum of all DASH representations)
      let ref1080Bytes = exactResBytes['1080'] || 0;
      if (!ref1080Bytes && exactResBytes['720']) {
        ref1080Bytes = Math.round(exactResBytes['720'] * 1.85);
      } else if (!ref1080Bytes && exactResBytes['480']) {
        ref1080Bytes = Math.round(exactResBytes['480'] * 3.1);
      } else if (!ref1080Bytes && dashCombinedBytes > 0) {
        // play-info/v2 streams[0].size is the total DASH directory size (1080p + 720p + 480p combined)
        ref1080Bytes = Math.round(dashCombinedBytes * 0.54);
      }
      if (ref1080Bytes <= 0) {
        ref1080Bytes = (se > 0 || ep > 0) ? 420 * 1024 * 1024 : 1150 * 1024 * 1024;
      }

      // 1. Parse play-info/v2 streams (DASH with signed cookie or direct MP4)
      if (playInfoRes.status === 'fulfilled' && Array.isArray(playInfoRes.value?.streams)) {
        for (const st of playInfoRes.value.streams) {
          const streamId = String(st.id || Date.now());
          if (!primaryResourceId) primaryResourceId = streamId;
          const resolutions = String(st.resolutions || playInfoRes.value.displayResolutions || '1080,720,480');
          const resArray = resolutions.split(',').map(r => r.trim()).filter(Boolean);
          const topRes = resArray[0] || '1080';
          const codec = (st.codecName || 'hevc').toUpperCase();
          const topResBytes = exactResBytes[topRes] || ref1080Bytes;
          const sizeMB = formatSizeLabel(topResBytes);
          const signCookie = st.signCookie || '';
          const dashBase = resolveDashBaseFromCookie(signCookie);

          if (dashBase) {
            const cleanCookie = signCookie.trim().replace(/;+$/, '');
            const streamKey = encodeStreamKey(dashBase, cleanCookie, activeSubjectId, se, ep);
            dashProxySessions.set(streamKey, {
              baseUrl: dashBase,
              signCookie: cleanCookie,
              subjectId: activeSubjectId,
              se,
              ep,
              resolutions,
              codec,
              createdAt: Date.now()
            });

            const dashUrl = `/api/mb-dash/${streamKey}/index.mpd`;
            const reqProto = req.headers['x-forwarded-proto'] || (IS_VERCEL ? 'https' : 'http');
            const reqHost = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
            const fullDashUrl = `${reqProto}://${reqHost}${dashUrl}`;

            resolvedStreams.push({
              id: streamKey,
              name: `MovieBox Official CDN (${resArray.map(r => r + 'p').join(' / ')} • ${codec})`,
              quality: topRes === '2160' ? '4K UHD' : (topRes === '1080' ? '1080p Full HD' : `${topRes}p HD`),
              resolutions: resArray,
              codec,
              audioCodec: 'AAC 2.0 Stereo',
              sizeBytes: topResBytes,
              sizeFormatted: sizeMB,
              type: 'dash',
              streamUrl: dashUrl,
              vlcUrl: fullDashUrl,
              headers: {
                Referer: STREAM_REFERER,
                'User-Agent': MOVIEBOX_UA,
                Cookie: signCookie
              }
            });
          } else if (st.url && !isDeprecationNoticeUrl(st.url)) {
            const proxyUrl = `/api/mb-proxy?url=${encodeURIComponent(st.url)}&cookie=${encodeURIComponent(signCookie)}`;
            resolvedStreams.push({
              id: streamId,
              name: `MovieBox Direct MP4 (${topRes}p • ${codec})`,
              quality: topRes === '1080' ? '1080p Full HD' : `${topRes}p HD`,
              resolutions: resArray,
              codec,
              audioCodec: 'AAC 2.0 Stereo',
              sizeBytes: topResBytes,
              sizeFormatted: sizeMB,
              type: 'mp4',
              streamUrl: proxyUrl,
              vlcUrl: st.url,
              headers: {
                Referer: STREAM_REFERER,
                'User-Agent': MOVIEBOX_UA
              }
            });
          }
        }
      }

      // 2. Parse direct resource items if any non-deprecated links exist
      if (resourceRes.status === 'fulfilled' && Array.isArray(resourceRes.value?.list)) {
        for (const item of resourceRes.value.list) {
          const link = item.resourceLink || item.url;
          if (link && !isDeprecationNoticeUrl(link)) {
            const resNum = String(item.resolution || 1080);
            const sizeBytes = Number(item.size || exactResBytes[resNum] || 0);
            const sizeMB = sizeBytes > 0 ? formatSizeLabel(sizeBytes) : '';
            resolvedStreams.push({
              id: String(item.resourceId || Date.now()),
              name: `Direct Mirror • ${item.uploadBy || 'CDN'} (${resNum}p)`,
              quality: resNum === '1080' ? '1080p Full HD' : `${resNum}p HD`,
              resolutions: [resNum],
              codec: (item.codecName || 'H264').toUpperCase(),
              audioCodec: 'AAC 2.0 Stereo',
              sizeBytes,
              sizeFormatted: sizeMB,
              type: 'mp4',
              streamUrl: `/api/mb-proxy?url=${encodeURIComponent(link)}`,
              vlcUrl: link,
              headers: {
                Referer: STREAM_REFERER,
                'User-Agent': MOVIEBOX_UA
              }
            });
          }
        }
      }

      // Build multi-resolution quality options with exact or accurately scaled file sizes
      const primaryStream = resolvedStreams[0] || null;
      const rawResList = primaryStream?.resolutions?.length
        ? primaryStream.resolutions
        : (Object.keys(exactResBytes).length ? Object.keys(exactResBytes).sort((a, b) => Number(b) - Number(a)) : ['1080', '720', '480']);

      const ratioMap = { '2160': 2.1, '1440': 1.45, '1080': 1.0, '720': 0.54, '480': 0.32, '360': 0.22 };
      const labelMap = {
        '2160': '4K Ultra HD (2160p)',
        '1440': '2K QHD (1440p)',
        '1080': '1080p Full HD',
        '720': '720p HD',
        '480': '480p SD',
        '360': '360p Data Saver'
      };
      const qualityOptions = rawResList.map((resStr, idx) => {
        const cleanRes = String(resStr).replace(/\D/g, '') || '1080';
        const exactBytes = exactResBytes[cleanRes];
        const ratio = ratioMap[cleanRes] || Math.max(0.25, 1 - idx * 0.35);
        const estBytes = exactBytes && exactBytes > 0 ? exactBytes : Math.round(ref1080Bytes * ratio);
        return {
          id: `q_${cleanRes}`,
          resolution: `${cleanRes}p`,
          height: Number(cleanRes),
          quality: labelMap[cleanRes] || `${cleanRes}p HD`,
          repId: String(idx),
          codec: primaryStream?.codec || 'HEVC',
          audioCodec: 'AAC 2.0 Stereo',
          sizeBytes: estBytes,
          sizeFormatted: formatSizeLabel(estBytes),
          streamUrl: primaryStream?.streamUrl || null
        };
      });

      const audioTypes = [
        { id: 'aac_stereo', label: 'AAC 2.0 Stereo (Original)', channels: '2.0', codec: 'AAC-LC', default: true },
        { id: 'ddp_surround', label: 'Dolby Surround 5.1 (Spatial)', channels: '5.1', codec: 'E-AC3 / Spatial', default: false },
        { id: 'vocal_clarity', label: 'Dialogue Clarity Boost', channels: '2.0', codec: 'Enhanced', default: false }
      ];

      // 3. Fetch real subtitles (get-ext-captions requires resource.list[].resourceId & episode=0)
      const subtitles = [];
      const seenSubUrls = new Set();
      const collectSubtitles = async (targetSubjId, targetResId) => {
        if (!targetSubjId || !targetResId) return;
        try {
          const capData = await movieBoxRequest(
            'GET',
            `/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${encodeURIComponent(targetSubjId)}&resourceId=${encodeURIComponent(targetResId)}&episode=0`
          );
          const rawCaps = capData?.extCaptions || [];
          for (const cap of rawCaps) {
            const cUrl = cap.url || '';
            const cSize = Number(cap.size || 0);
            if (!cUrl || cUrl.includes('aa348f2541d13ffe') || (cSize > 0 && cSize <= 50)) continue;
            if (seenSubUrls.has(cUrl)) continue;
            seenSubUrls.add(cUrl);
            const langName = (cap.lanName && cap.lanName.trim()) || cap.lan || 'English';
            subtitles.push({
              id: String(cap.id || subtitles.length),
              lang: cap.lan || 'en',
              label: langName,
              srtUrl: cUrl,
              vttUrl: `/api/mb-subtitle?url=${encodeURIComponent(cUrl)}`
            });
          }
        } catch {}
      };

      await collectSubtitles(activeSubjectId, primaryResourceId);

      // If dubbed audio track has no captions attached, pull captions from Original Audio dub
      if (subtitles.length === 0) {
        try {
          const det = subjectDetails || await movieBoxRequest('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(subjectId)}`);
          const origDub = (det?.dubs || []).find(d => d.original || d.lanCode === 'en') || (det?.dubs || [])[0];
          const origId = origDub ? String(origDub.subjectId || '') : '';
          if (origId && origId !== String(activeSubjectId)) {
            const origResPath = se === 0 && ep === 0
              ? `/wefeed-mobile-bff/subject-api/resource?subjectId=${encodeURIComponent(origId)}&page=1&perPage=5`
              : `/wefeed-mobile-bff/subject-api/resource?subjectId=${encodeURIComponent(origId)}&se=${se}&ep=${ep}&page=1&perPage=5`;
            const origRes = await movieBoxRequest('GET', origResPath);
            const origResourceId = origRes?.list?.[0]?.resourceId;
            if (origResourceId) {
              await collectSubtitles(origId, String(origResourceId));
            }
          }
        } catch {}
      }

      const multiProviderServers = buildServerStreams({ subjectId: activeSubjectId, title: 'Stream', cleanTitle: 'Stream' }, se, ep);
      if (resolvedStreams.length === 0) {
        resolvedStreams.push(...multiProviderServers);
      } else {
        for (const s of multiProviderServers) {
          if (!s.isPrimary) {
            resolvedStreams.push(s);
          }
        }
      }

      return sendJson(res, 200, {
        ok: true,
        subjectId: activeSubjectId,
        requestedSubjectId: subjectId,
        se,
        ep,
        baseSizeBytes: ref1080Bytes,
        qualityOptions: qualityOptions.length > 0 ? qualityOptions : ['4K Ultra HD', '1080p Full HD', '720p HD'],
        audioTypes: audioTypes.length > 0 ? audioTypes : [{ id: 'orig', label: 'Original Audio' }, { id: 'dual', label: 'Hindi / Dual Audio' }],
        streams: resolvedStreams,
        subtitles: subtitles.slice(0, 15)
      });
    } catch (err) {
      const fallbackStreams = buildServerStreams({ subjectId, title: 'Stream', cleanTitle: 'Stream' }, se, ep);
      return sendJson(res, 200, {
        ok: true,
        subjectId,
        requestedSubjectId: subjectId,
        se,
        ep,
        qualityOptions: ['4K Ultra HD', '1080p Full HD', '720p HD'],
        audioTypes: [{ id: 'orig', label: 'Original Audio' }],
        streams: fallbackStreams,
        subtitles: []
      });
    }
  }

  // --------------------------------------------------------------------------
  // F. GET /api/mb-dash/:streamKey/:file — Transparent MovieBox DASH Proxy!
  //    Forwards Referer: https://sportslive.wine + Edge-Cache-Cookie + Range
  //    so BOTH Browser dash.js AND VLC Media Player play seamlessly!
  // --------------------------------------------------------------------------
  if ((pathname.startsWith('/api/mb-dash/') || pathname.startsWith('/mb-dash/')) && req.method === 'GET') {
    const rawDash = pathname.startsWith('/api/mb-dash/') ? pathname.replace('/api/mb-dash/', '') : pathname.replace('/mb-dash/', '');
    const parts = rawDash.split('/');
    const streamKey = parts[0];
    const subPath = parts.slice(1).join('/') || 'index.mpd';
    const session = decodeStreamKey(streamKey);

    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'DASH session expired or not found' }));
    }

    const targetUrl = `${session.baseUrl}/${subPath}`;
    const upstreamHeaders = {
      'Referer': STREAM_REFERER,
      'User-Agent': MOVIEBOX_UA,
      'Cookie': session.signCookie
    };
    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(60000)
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        if (!res.headersSent) res.writeHead(upstreamRes.status);
        return res.end(`Upstream error ${upstreamRes.status}`);
      }

      // If index.mpd, dynamically patch bare codecs="hev1" per Representation resolution:
      // CinemaScope Movies (e.g. 2592x1080) use HEVC Level 5.0 (L150), 1080p/720p use Level 4.0 (L120), 480p uses Level 3.0 (L90)
      if (subPath.endsWith('.mpd')) {
        let mpdXml = await upstreamRes.text();
        mpdXml = mpdXml.replace(/<Representation\b([^>]*?)codecs="hev1"([^>]*?)>/gi, (full, before, after) => {
          const attrs = `${before} ${after}`;
          const wMatch = attrs.match(/\bwidth="(\d+)"/i);
          const hMatch = attrs.match(/\bheight="(\d+)"/i);
          const width = wMatch ? parseInt(wMatch[1], 10) : 1920;
          const height = hMatch ? parseInt(hMatch[1], 10) : 1080;
          const level = (width > 1920 || height > 1080) ? 'L150' : ((width >= 1280 || height >= 720) ? 'L120' : 'L90');
          return `<Representation${before}codecs="hev1.1.6.${level}.90"${after}>`;
        });
        mpdXml = mpdXml.replace(/codecs="hev1"/g, 'codecs="hev1.1.6.L120.90"');
        if (!res.headersSent) {
          res.writeHead(200, {
            'Content-Type': 'application/dash+xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          });
        }
        return res.end(mpdXml);
      }

      // Stream binary .m4s initialization or media chunk directly
      const responseHeaders = {
        'Content-Type': upstreamRes.headers.get('content-type') || 'video/iso.segment',
        'Access-Control-Allow-Origin': '*'
      };
      const contentLen = upstreamRes.headers.get('content-length');
      const contentRange = upstreamRes.headers.get('content-range');
      if (contentLen) responseHeaders['Content-Length'] = contentLen;
      if (contentRange) responseHeaders['Content-Range'] = contentRange;

      res.writeHead(upstreamRes.status, responseHeaders);
      if (upstreamRes.body) {
        const reader = upstreamRes.body.getReader();
        req.once('close', () => {
          try { reader.cancel(); } catch {}
        });
        while (true) {
          const { done, value } = await reader.read();
          if (done || res.writableEnded || res.destroyed) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise(r => {
              res.once('drain', r);
              res.once('close', r);
            });
          }
        }
      }
      if (!res.writableEnded) res.end();
      return;
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502);
        return res.end(`DASH proxy error: ${err.message}`);
      }
      if (!res.writableEnded) res.end();
      return;
    }
  }

  // --------------------------------------------------------------------------
  // G. GET /api/mb-proxy?url=... — Direct MP4 / MKV Stream Proxy with Headers
  // --------------------------------------------------------------------------
  if (pathname === '/api/mb-proxy' && req.method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url');
    const cookie = parsedUrl.searchParams.get('cookie') || '';
    if (!targetUrl) {
      res.writeHead(400);
      return res.end('Missing url');
    }

    const headers = {
      'Referer': STREAM_REFERER,
      'User-Agent': MOVIEBOX_UA
    };
    if (cookie) headers['Cookie'] = cookie;
    if (req.headers.range) headers['Range'] = req.headers.range;

    try {
      const upstream = await fetch(targetUrl, { headers });
      const resHeaders = {
        'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes'
      };
      if (upstream.headers.get('content-length')) {
        resHeaders['Content-Length'] = upstream.headers.get('content-length');
      }
      if (upstream.headers.get('content-range')) {
        resHeaders['Content-Range'] = upstream.headers.get('content-range');
      }
      res.writeHead(upstream.status, resHeaders);
      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done || res.writableEnded) break;
            if (!res.write(Buffer.from(value))) {
              await new Promise(r => res.once('drain', r));
            }
          }
          if (!res.writableEnded) res.end();
        };
        pump().catch(() => { if (!res.writableEnded) res.end(); });
      } else {
        res.end();
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(err.message);
      } else if (!res.writableEnded) {
        res.end();
      }
    }
    return;
  }

  // --------------------------------------------------------------------------
  // H. GET /api/mb-subtitle?url=... — Convert MovieBox .srt to WebVTT on the fly
  // --------------------------------------------------------------------------
  if (pathname === '/api/mb-subtitle' && req.method === 'GET') {
    const subUrl = parsedUrl.searchParams.get('url');
    if (!subUrl) {
      res.writeHead(400);
      return res.end('Missing subtitle url');
    }
    try {
      const subRes = await fetch(subUrl, {
        headers: { 'User-Agent': MOVIEBOX_UA },
        signal: AbortSignal.timeout(8000)
      });
      const srtText = await subRes.text();
      const vttText = srtToVtt(srtText);
      res.writeHead(200, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(vttText);
    } catch (err) {
      res.writeHead(502);
      return res.end(`WEBVTT\n\n`);
    }
  }

  // --------------------------------------------------------------------------
  // I. GET /api/local-stream — Stream Local D:\Home Theater 4K Files (HTTP 206)
  // --------------------------------------------------------------------------
  if (pathname === '/api/local-stream' && req.method === 'GET') {
    const filePath = parsedUrl.searchParams.get('path');
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end('File not found');
    }

    const resolved = path.resolve(filePath);
    if (!resolved.toLowerCase().startsWith(HOME_THEATER_DIR.toLowerCase())) {
      res.writeHead(403);
      return res.end('Access denied');
    }

    const stat = fs.statSync(resolved);
    const fileSize = stat.size;
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'video/mp4';
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(resolved, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(resolved).pipe(res);
    }
    return;
  }

  // --------------------------------------------------------------------------
  // J. POST /api/vlc — Launch VLC with Exact MovieBox-TUI Flags & Subtitles!
  // --------------------------------------------------------------------------
  if (pathname === '/api/vlc' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      let target = body.vlcUrl || body.path || body.url;
      const title = body.title || 'MovieBox Stream';
      const startTime = Number(body.startTime || 0);
      const subtitleUrl = body.subtitleUrl || null;

      if (!target) {
        return sendJson(res, 400, { ok: false, error: 'Missing playback URL or file path' });
      }

      if (target.startsWith('/')) {
        target = `http://localhost:${PORT}${target}`;
      }

      const vlcExe = getVlcPath();
      // Exact verified VLC arguments from MovieBox-TUI src/player.rs
      const args = [
        '--no-one-instance',
        '--network-caching=3000',
        '--file-caching=3000',
        `--meta-title=${title}`
      ];

      if (startTime > 0) {
        args.push(`--start-time=${Math.floor(startTime)}`);
      }

      const isRemoteHttp = /^https?:\/\//i.test(target) && !target.includes(`localhost:${PORT}`);
      if (isRemoteHttp) {
        if (body.headers) {
          if (body.headers.Referer) args.push(`--http-referrer=${body.headers.Referer}`);
          if (body.headers['User-Agent']) args.push(`--http-user-agent=${body.headers['User-Agent']}`);
        } else {
          args.push(`--http-referrer=${STREAM_REFERER}`);
          args.push(`--http-user-agent=${MOVIEBOX_UA}`);
        }
      }

      // Download .srt subtitle locally for VLC if provided
      if (subtitleUrl) {
        try {
          if (!fs.existsSync(SUBS_CACHE_DIR)) fs.mkdirSync(SUBS_CACHE_DIR, { recursive: true });
          const subFile = path.join(SUBS_CACHE_DIR, `mb_sub_${Date.now()}.srt`);
          const subRes = await fetch(subtitleUrl, { signal: AbortSignal.timeout(5000) });
          if (subRes.ok) {
            const subBuf = Buffer.from(await subRes.arrayBuffer());
            fs.writeFileSync(subFile, subBuf);
            args.push(`--sub-file=${subFile}`);
          }
        } catch {}
      }

      args.push(target);

      const child = spawn(vlcExe, args, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      return sendJson(res, 200, {
        ok: true,
        message: `Launched "${title}" in VLC Media Player`,
        vlcPath: vlcExe,
        target
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // K. POST /api/launch-tui & POST /api/open-folder & POST /api/save-state
  // --------------------------------------------------------------------------
  if (pathname === '/api/launch-tui' && req.method === 'POST') {
    try {
      const tuiExe = path.join(APP_DIR, 'moviebox-tui.exe');
      const child = spawn('cmd.exe', ['/c', 'start', 'MovieBox-TUI', tuiExe], {
        cwd: APP_DIR,
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/open-folder' && req.method === 'POST') {
    try {
      const child = spawn('explorer.exe', [HOME_THEATER_DIR], { detached: true, stdio: 'ignore' });
      child.unref();
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/save-state' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const currentUiData = readJsonSafe(UI_DATA_FILE, getDefaultUiData());
      const updated = { ...currentUiData, ...(body.uiData || {}) };
      writeJsonSafe(UI_DATA_FILE, updated);

      if (body.historyEntry) {
        const tuiHistory = readJsonSafe(TUI_HISTORY_FILE, { watched: [], recent: [] });
        const entry = body.historyEntry;
        const subjId = String(entry.subjectId || entry.id || Date.now()).replace(/^mb_/, '');
        tuiHistory.recent = (tuiHistory.recent || []).filter(
          r => String(r.subject_id) !== subjId && r.title.toLowerCase() !== entry.title.toLowerCase()
        );
        tuiHistory.recent.unshift({
          provider: entry.providerKind || 'moviebox',
          subject_id: subjId,
          title: entry.title,
          cover_url: entry.poster || '',
          stype: entry.type === 'series' ? 2 : 1,
          release_year: String(entry.year || '2026'),
          season: entry.season || 0,
          episode: entry.episode || 0,
          timestamp: Math.floor(Date.now() / 1000),
          duration_seconds: entry.duration || null,
          progress_seconds: entry.progress || 0,
          completed: false,
          stream_filename: entry.quality || '1080p hevc'
        });
        writeJsonSafe(TUI_HISTORY_FILE, tuiHistory);
      }

      return sendJson(res, 200, { ok: true, uiData: updated });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // L. DOWNLOAD MANAGER API (Real-Time Progress %, Speed MB/s, Size & ETA)
  // --------------------------------------------------------------------------
  if (pathname === '/api/downloads' && req.method === 'GET') {
    const list = Array.from(downloadJobs.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(serializeDownloadJob);
    return sendJson(res, 200, {
      ok: true,
      defaultFolder: DOWNLOADS_DIR,
      folderPresets: [
        DOWNLOADS_DIR,
        path.join(HOME_THEATER_DIR, 'Movies'),
        path.join(HOME_THEATER_DIR, 'Series'),
        HOME_THEATER_DIR
      ],
      downloads: list
    });
  }

  if (pathname === '/api/browse-folder' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const initialDir = (body && body.initialDir && fs.existsSync(body.initialDir))
        ? body.initialDir
        : HOME_THEATER_DIR;
      const escapedInit = String(initialDir).replace(/'/g, "''");
      const psScript = [
        "Add-Type -AssemblyName System.Windows.Forms;",
        "$f = New-Object System.Windows.Forms.FolderBrowserDialog;",
        "$f.Description = 'Select Destination Folder for Download';",
        `$f.SelectedPath = '${escapedInit}';`,
        "$f.ShowNewFolderButton = $true;",
        "$top = New-Object System.Windows.Forms.Form;",
        "$top.TopMost = $true;",
        "if ($f.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"
      ].join(' ');

      const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', psScript], {
        windowsHide: true
      });
      let stdout = '';
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.on('close', () => {
        const picked = stdout.trim();
        return sendJson(res, 200, {
          ok: Boolean(picked),
          folderPath: picked || null
        });
      });
      child.on('error', err => {
        return sendJson(res, 500, { ok: false, error: err.message });
      });
      return;
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/downloads/start' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const job = await createAndStartDownloadJob(body);
      return sendJson(res, 200, { ok: true, download: serializeDownloadJob(job) });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/downloads/action' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const { id, action } = body;
      const job = downloadJobs.get(id);
      if (!job) return sendJson(res, 404, { ok: false, error: 'Download not found' });

      if (action === 'pause') {
        if (job.status === 'downloading') {
          job.status = 'paused';
          job.speedBytesPerSec = 0;
          if (job.abortController) job.abortController.abort();
        }
      } else if (action === 'resume') {
        if (job.status === 'paused' || job.status === 'error') {
          runDownloadWorker(job).catch(() => {});
        }
      } else if (action === 'cancel') {
        job.status = 'cancelled';
        job.speedBytesPerSec = 0;
        if (job.abortController) job.abortController.abort();
        try {
          if (job.savePath && fs.existsSync(job.savePath)) fs.unlinkSync(job.savePath);
        } catch {}
      } else if (action === 'remove') {
        if (job.abortController) job.abortController.abort();
        downloadJobs.delete(id);
        return sendJson(res, 200, { ok: true, removed: id });
      } else if (action === 'open-folder') {
        const folderFallback = (job.targetFolder && fs.existsSync(job.targetFolder)) ? job.targetFolder : DOWNLOADS_DIR;
        const targetPath = job.savePath && fs.existsSync(job.savePath) ? job.savePath : folderFallback;
        const args = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
          ? [`/select,${targetPath}`]
          : [folderFallback];
        const child = spawn('explorer.exe', args, { detached: true, stdio: 'ignore' });
        child.unref();
      }

      return sendJson(res, 200, { ok: true, download: serializeDownloadJob(job) });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // If an API endpoint was requested but did not match any handler above, return JSON 404
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, {
      ok: false,
      error: `API endpoint not found: ${pathname}`,
      requestedUrl: req.url,
      resolvedPath: pathname
    });
  }

  // Static files in ./ui
  let safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(UI_DIR, safePath);
  if (!filePath.startsWith(UI_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  // 1. Instant sub-millisecond in-memory delivery for core PWA assets (Vercel Serverless & Edge)
  if (safePath === '/' || safePath === '/index.html') {
    if (STATIC_IN_MEMORY['/index.html']) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      });
      return res.end(STATIC_IN_MEMORY['/index.html']);
    }
  }

  if (STATIC_IN_MEMORY[safePath]) {
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': safePath === '/sw.js' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
    });
    return res.end(STATIC_IN_MEMORY[safePath]);
  }

  // 2. Fallback to filesystem stream if available
  const candidateFile = (fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    ? filePath
    : (fs.existsSync(path.join(UI_DIR, 'index.html')) ? path.join(UI_DIR, 'index.html') : null);

  if (candidateFile) {
    const ext = path.extname(candidateFile).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    const stream = fs.createReadStream(candidateFile);
    stream.on('error', (err) => {
      console.warn('[Static Stream Error]:', err?.message);
      if (!res.headersSent) {
        if (STATIC_IN_MEMORY['/index.html']) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(STATIC_IN_MEMORY['/index.html']);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!DOCTYPE html><html><head><title>MovieBox Studio</title></head><body>Loading MovieBox Studio...</body></html>');
        }
      }
    });
    stream.pipe(res);
  } else {
    // 3. Fallback for SPA routing: serve index.html with 200 OK
    if (STATIC_IN_MEMORY['/index.html']) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      });
      return res.end(STATIC_IN_MEMORY['/index.html']);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// ============================================================================
// 5. REAL-TIME DOWNLOAD MANAGER ENGINE (DIRECT HTTP + MOVIEBOX DASH SEGMENTS)
// ============================================================================
const DOWNLOADS_DIR = path.join(HOME_THEATER_DIR, 'Downloads');
const downloadJobs = new Map();

function sanitizeFilename(name) {
  return String(name || 'MovieBox_Video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'MovieBox_Video';
}

function parseIsoDurationSeconds(iso) {
  if (!iso) return 0;
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/i);
  if (!m) return 0;
  const h = parseFloat(m[1] || '0');
  const min = parseFloat(m[2] || '0');
  const s = parseFloat(m[3] || '0');
  return h * 3600 + min * 60 + s;
}

function serializeDownloadJob(job) {
  const progress = job.totalBytes > 0
    ? Math.min(100, Math.round((job.downloadedBytes / job.totalBytes) * 1000) / 10)
    : (job.totalSegments > 0
        ? Math.min(100, Math.round((job.completedSegments / job.totalSegments) * 1000) / 10)
        : (job.status === 'completed' ? 100 : 0));

  return {
    id: job.id,
    title: job.title,
    poster: job.poster || '',
    quality: job.quality || '1080p Full HD',
    language: job.language || 'Original',
    audioType: job.audioType || 'AAC 2.0 Stereo',
    targetFolder: job.targetFolder || DOWNLOADS_DIR,
    filename: job.filename,
    savePath: job.savePath,
    streamUrl: `/api/local-stream?path=${encodeURIComponent(job.savePath)}`,
    mode: job.mode,
    status: job.status,
    error: job.error || null,
    progress,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    speedBytesPerSec: job.status === 'downloading' ? job.speedBytesPerSec : 0,
    etaSeconds: job.status === 'downloading' ? job.etaSeconds : null,
    completedSegments: job.completedSegments || 0,
    totalSegments: job.totalSegments || 0,
    createdAt: job.createdAt
  };
}

async function createAndStartDownloadJob(params) {
  let targetFolder = (params.targetFolder && String(params.targetFolder).trim())
    ? path.resolve(String(params.targetFolder).trim())
    : DOWNLOADS_DIR;
  try {
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
  } catch {
    targetFolder = DOWNLOADS_DIR;
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }
  }

  const title = params.title || 'MovieBox Media';
  const quality = params.quality || '1080p Full HD';
  const language = (params.language && String(params.language).trim()) || '';
  const audioType = (params.audioType && String(params.audioType).trim()) || 'AAC 2.0 Stereo';
  const repId = params.repId !== undefined && params.repId !== null ? String(params.repId) : '0';
  const se = Number(params.se || 0);
  const ep = Number(params.ep || 0);
  const epSuffix = se > 0 && ep > 0 ? ` S${String(se).padStart(2, '0')}E${String(ep).padStart(2, '0')}` : '';
  const langTag = language ? `${language} - ` : '';
  const safeBase = sanitizeFilename(`${title}${epSuffix} [${langTag}${quality}]`);
  const ext = (params.url && /\.mkv(\?|$)/i.test(params.url)) ? '.mkv' : '.mp4';
  const filename = `${safeBase}${ext}`;
  const savePath = path.join(targetFolder, filename);

  const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job = {
    id,
    title: `${title}${epSuffix}`,
    poster: params.poster || '',
    quality,
    language: language || 'Original',
    audioType,
    repId,
    targetFolder,
    filename,
    savePath,
    subjectId: params.subjectId ? String(params.subjectId).replace(/^mb_/, '') : null,
    se,
    ep,
    url: params.url || params.streamUrl || null,
    dashBase: null,
    signCookie: null,
    mode: 'http',
    status: 'starting',
    error: null,
    downloadedBytes: 0,
    totalBytes: Number(params.sizeBytes || 0),
    speedBytesPerSec: 0,
    etaSeconds: null,
    completedSegments: 0,
    totalSegments: 0,
    createdAt: Date.now(),
    abortController: null
  };

  // Check if URL is an active /api/mb-dash/:streamKey/index.mpd session
  if (job.url && job.url.startsWith('/api/mb-dash/')) {
    const streamKey = job.url.replace('/api/mb-dash/', '').split('/')[0];
    const sess = dashProxySessions.get(streamKey);
    if (sess) {
      job.dashBase = sess.baseUrl;
      job.signCookie = sess.signCookie;
      job.mode = 'dash';
    }
  }

  downloadJobs.set(id, job);
  runDownloadWorker(job).catch(err => {
    if (job.status !== 'paused' && job.status !== 'cancelled') {
      job.status = 'error';
      job.error = err.message;
      job.speedBytesPerSec = 0;
    }
  });

  return job;
}

async function runDownloadWorker(job) {
  job.status = 'downloading';
  job.error = null;
  job.abortController = new AbortController();
  const signal = job.abortController.signal;

  // 1. If subjectId is provided and we don't have dashBase or direct URL yet, resolve via MovieBox play-info/v2
  if (job.subjectId && !job.dashBase && (!job.url || job.url.startsWith('/api/mb-dash/'))) {
    const fetchPlay = async (sid, sNum, eNum) => {
      const p = `/wefeed-mobile-bff/subject-api/play-info/v2?subjectId=${encodeURIComponent(sid)}&se=${sNum}&ep=${eNum}`;
      return movieBoxRequest('GET', p);
    };

    let playInfo = await fetchPlay(job.subjectId, job.se, job.ep).catch(() => null);
    if (!playInfo?.streams?.length) {
      const altSe = (job.se === 0 && job.ep === 0) ? 1 : 0;
      const altEp = (job.se === 0 && job.ep === 0) ? 1 : 0;
      playInfo = await fetchPlay(job.subjectId, altSe, altEp).catch(() => null);
    }
    if (!playInfo?.streams?.length) {
      try {
        const det = await movieBoxRequest('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(job.subjectId)}`);
        const origDub = (det?.dubs || []).find(d => d.original) || (det?.dubs || [])[0];
        if (origDub?.subjectId) {
          playInfo = await fetchPlay(String(origDub.subjectId), job.se, job.ep).catch(() => null);
        }
      } catch {}
    }

    const st = playInfo?.streams?.[0];
    if (st) {
      if (Number(st.size) > 0 && !job.totalBytes) {
        // st.size is total DASH folder size (1080p + 720p + 480p combined)
        const repScale = job.repId === '1' ? 0.29 : (job.repId === '2' ? 0.17 : 0.54);
        job.totalBytes = Math.round(Number(st.size) * repScale);
      }
      const dashBase = resolveDashBaseFromCookie(st.signCookie || '');
      if (dashBase) {
        job.dashBase = dashBase;
        job.signCookie = (st.signCookie || '').trim().replace(/;+$/, '');
        job.mode = 'dash';
      } else if (st.url && !isDeprecationNoticeUrl(st.url)) {
        job.url = st.url;
        job.signCookie = st.signCookie || '';
        job.mode = 'http';
      }
    }
  }

  // Speed calculation helper
  let lastTickTime = Date.now();
  let lastTickBytes = job.downloadedBytes;
  const updateSpeedMetrics = () => {
    const now = Date.now();
    const elapsedSec = (now - lastTickTime) / 1000;
    if (elapsedSec >= 0.4) {
      const deltaBytes = Math.max(0, job.downloadedBytes - lastTickBytes);
      const instantSpeed = deltaBytes / elapsedSec;
      job.speedBytesPerSec = job.speedBytesPerSec > 0
        ? Math.round(job.speedBytesPerSec * 0.6 + instantSpeed * 0.4)
        : Math.round(instantSpeed);
      if (job.totalBytes > job.downloadedBytes && job.speedBytesPerSec > 0) {
        job.etaSeconds = Math.ceil((job.totalBytes - job.downloadedBytes) / job.speedBytesPerSec);
      } else {
        job.etaSeconds = null;
      }
      lastTickTime = now;
      lastTickBytes = job.downloadedBytes;
    }
  };

  // 2A. MovieBox DASH Segment Downloader (Supports both SegmentTemplate duration and Movie SegmentTimeline!)
  if (job.mode === 'dash' && job.dashBase) {
    const headers = {
      'Referer': STREAM_REFERER,
      'User-Agent': MOVIEBOX_UA,
      'Cookie': job.signCookie
    };

    const mpdRes = await fetch(`${job.dashBase}/index.mpd`, { headers, signal });
    if (!mpdRes.ok) throw new Error(`MPD fetch failed (${mpdRes.status})`);
    const mpdXml = await mpdRes.text();

    const durationMatch = mpdXml.match(/mediaPresentationDuration="([^"]+)"/i);
    const totalDurationSec = durationMatch ? parseIsoDurationSeconds(durationMatch[1]) : 1200;

    const repId = String(job.repId || '0');
    // Locate the video AdaptationSet or specific Representation block
    const repBlockRegex = new RegExp(`<Representation[^>]+id="${repId}"[^>]*>[\\s\\S]*?<\\/Representation>`, 'i');
    const repBlockMatch = mpdXml.match(repBlockRegex);
    const searchScope = repBlockMatch ? repBlockMatch[0] : mpdXml;

    const segTagMatch = searchScope.match(/<SegmentTemplate\b([^>]+)>/i) || mpdXml.match(/<SegmentTemplate\b([^>]+)>/i);
    const segAttrs = segTagMatch ? segTagMatch[1] : '';
    const tsMatch = segAttrs.match(/\btimescale="(\d+)"/i);
    const durMatch = segAttrs.match(/\bduration="(\d+)"/i);
    const initMatch = segAttrs.match(/\binitialization="([^"]+)"/i);
    const mediaMatch = segAttrs.match(/\bmedia="([^"]+)"/i);

    const timescale = tsMatch ? parseFloat(tsMatch[1]) : 1000000;
    const segDur = durMatch ? parseFloat(durMatch[1]) : 5000000;

    // Check if Movie uses <SegmentTimeline><S d="..." r="..."/></SegmentTimeline>
    let totalSegments = 0;
    const timelineMatch = searchScope.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/i) || mpdXml.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/i);
    if (timelineMatch) {
      const sTags = timelineMatch[1].match(/<S\b[^>]*>/gi) || [];
      for (const sTag of sTags) {
        const rAttr = sTag.match(/\br="(-?\d+)"/i);
        const repeatCount = rAttr ? parseInt(rAttr[1], 10) : 0;
        totalSegments += 1 + Math.max(0, repeatCount);
      }
    }
    if (totalSegments <= 0) {
      const segDurationSec = segDur / timescale;
      totalSegments = Math.max(1, Math.ceil(totalDurationSec / segDurationSec));
    }
    job.totalSegments = totalSegments;

    const initFile = (initMatch ? initMatch[1] : `init-stream${repId}.m4s`).replace('$RepresentationID$', repId);
    const mediaPattern = (mediaMatch ? mediaMatch[1] : `chunk-stream${repId}-$Number%05d$.m4s`).replace('$RepresentationID$', repId);

    const writeFlags = job.completedSegments > 0 ? 'a' : 'w';
    const fileStream = fs.createWriteStream(job.savePath, { flags: writeFlags });

    try {
      // Download initialization segment first if starting from 0
      if (job.completedSegments === 0) {
        const initRes = await fetch(`${job.dashBase}/${initFile}`, { headers, signal });
        if (initRes.ok) {
          const buf = Buffer.from(await initRes.arrayBuffer());
          fileStream.write(buf);
          job.downloadedBytes += buf.length;
          updateSpeedMetrics();
        }
      }

      // Download numbered media segments sequentially into the MP4 file
      for (let segNum = (job.completedSegments || 0) + 1; segNum <= totalSegments; segNum++) {
        if (job.status !== 'downloading') break;
        const padded = String(segNum).padStart(5, '0');
        const segFile = mediaPattern.replace(/\$Number%0\d+d\$/i, padded).replace('$Number$', String(segNum));
        const segRes = await fetch(`${job.dashBase}/${segFile}`, { headers, signal });
        if (segRes.status === 404 && segNum > Math.max(1, totalSegments - 5)) {
          break;
        }
        if (!segRes.ok) {
          throw new Error(`Segment ${segNum} HTTP ${segRes.status}`);
        }
        const buf = Buffer.from(await segRes.arrayBuffer());
        if (!fileStream.write(buf)) {
          await new Promise(r => fileStream.once('drain', r));
        }
        job.downloadedBytes += buf.length;
        job.completedSegments = segNum;
        if (!job.totalBytes || job.downloadedBytes > job.totalBytes) {
          const avgSeg = job.downloadedBytes / segNum;
          job.totalBytes = Math.round(avgSeg * totalSegments);
        }
        updateSpeedMetrics();
      }

      fileStream.end();
      if (job.status === 'downloading') {
        job.totalBytes = job.downloadedBytes;
        job.status = 'completed';
        job.speedBytesPerSec = 0;
        job.etaSeconds = 0;
      }
    } catch (err) {
      fileStream.end();
      if (job.status !== 'paused' && job.status !== 'cancelled') {
        job.status = 'error';
        job.error = err.message;
        job.speedBytesPerSec = 0;
      }
    }
    return;
  }

  // 2B. Direct HTTP / MP4 / MKV Stream Downloader (with Resume support)
  let targetUrl = job.url;
  if (!targetUrl) {
    throw new Error('No downloadable stream URL found for this title');
  }
  if (targetUrl.startsWith('/')) {
    targetUrl = `http://localhost:${PORT}${targetUrl}`;
  }

  const headers = {
    'User-Agent': BROWSER_UA,
    'Referer': STREAM_REFERER
  };
  if (job.signCookie) headers['Cookie'] = job.signCookie;
  if (job.downloadedBytes > 0 && fs.existsSync(job.savePath)) {
    headers['Range'] = `bytes=${job.downloadedBytes}-`;
  }

  const upstream = await fetch(targetUrl, { headers, signal });
  if (!upstream.ok && upstream.status !== 206) {
    throw new Error(`Download HTTP ${upstream.status}`);
  }

  const contentLength = Number(upstream.headers.get('content-length') || 0);
  if (contentLength > 0) {
    job.totalBytes = upstream.status === 206 ? job.downloadedBytes + contentLength : contentLength;
  }

  const fileStream = fs.createWriteStream(job.savePath, {
    flags: upstream.status === 206 ? 'a' : 'w'
  });

  try {
    if (upstream.body) {
      const reader = upstream.body.getReader();
      while (true) {
        if (job.status !== 'downloading') break;
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        if (!fileStream.write(buf)) {
          await new Promise(r => fileStream.once('drain', r));
        }
        job.downloadedBytes += buf.length;
        updateSpeedMetrics();
      }
    }
    fileStream.end();
    if (job.status === 'downloading') {
      job.totalBytes = Math.max(job.totalBytes, job.downloadedBytes);
      job.status = 'completed';
      job.speedBytesPerSec = 0;
      job.etaSeconds = 0;
    }
  } catch (err) {
    fileStream.end();
    if (job.status !== 'paused' && job.status !== 'cancelled') {
      job.status = 'error';
      job.error = err.message;
      job.speedBytesPerSec = 0;
    }
  }
}

// ============================================================================
// 6. SERVER STARTUP & "--open" ONE-CLICK DESKTOP APP WINDOW HANDLER
// ============================================================================
const shouldOpenBrowser = process.argv.includes('--open');

function openBrowserUrl(url) {
  try {
    const appCandidates = [
      path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    for (const browserExe of appCandidates) {
      if (browserExe && fs.existsSync(browserExe)) {
        const child = spawn(browserExe, [
          `--app=${url}`,
          '--window-size=1440,900',
          '--autoplay-policy=no-user-gesture-required'
        ], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        return;
      }
    }
    const child = spawn('cmd.exe', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch {}
}

const server = http.createServer(handleRequest);

handleRequest.server = server;
handleRequest.handleRequest = handleRequest;
handleRequest.default = handleRequest;

module.exports = handleRequest;

if (require.main === module) {
  server.on('error', err => {
    if (err && err.code === 'EADDRINUSE') {
      // Server is already running in background! Just open standalone app window and exit cleanly.
      if (shouldOpenBrowser) {
        openBrowserUrl(`http://localhost:${PORT}`);
      }
      process.exit(0);
    }
  });

  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  MovieBox Studio (Liquid Glass & Claymorphism Edition)`);
    console.log(`  Desktop App:  http://localhost:${PORT}`);
    console.log(`  MovieBox API: ${MOVIEBOX_HOSTS[0]}`);
    console.log(`  Home Theater: ${HOME_THEATER_DIR}`);
    console.log(`  Downloads:    ${DOWNLOADS_DIR}`);
    console.log(`  VLC Player:   ${getVlcPath()}`);
    console.log(`======================================================\n`);
    ensureMovieBoxToken(false).catch(() => {});
    if (shouldOpenBrowser) {
      openBrowserUrl(`http://localhost:${PORT}`);
    }
  });
}

