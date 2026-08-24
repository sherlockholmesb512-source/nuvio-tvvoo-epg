'use strict';

const zlib = require('zlib');
const { TTLCache, fetchWithTimeout, canonicalKey, fmtRome } = require('./util');

const RAW_BASE = 'https://raw.githubusercontent.com/matthuisman/i.mjh.nz/master';
const PLUTO_PATH = 'PlutoTV/.channels.json.gz';
const SAMSUNG_PATH = 'SamsungTVPlus/.channels.json.gz';

const PLUTO_PREFIX = 'nuvio-pluto';
const SAMSUNG_PREFIX = 'nuvio-samsung';
const EXTRA_PREFIX = 'nuvio-extra';
const RAKUTEN_PREFIX = 'nuvio-rakuten';
const CATALOG_PLUTO = 'plutotv_it';
const CATALOG_SAMSUNG = 'samsungtvplus_it';
const CATALOG_EXTRA = 'extra_it';
const CATALOG_RAKUTEN = 'rakutentv_it';

const streamCache = new TTLCache(10 * 60 * 1000);

const RAKUTEN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
  'Origin': 'https://rakuten.tv',
  'Referer': 'https://rakuten.tv/'
};
const RAKUTEN_QUERY = 'classification_id=36&device_identifier=web&locale=it&market_code=it';

const dataCache = new TTLCache(60 * 60 * 1000);
const inflight = new Map();

async function cachedLoad(key, loader) {
  const hit = dataCache.get(key);
  if (hit) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = loader()
    .then(data => { dataCache.set(key, data); inflight.delete(key); return data; })
    .catch(e => { inflight.delete(key); throw e; });
  inflight.set(key, p);
  return p;
}

async function fetchGzJson(relPath) {
  const r = await fetchWithTimeout(`${RAW_BASE}/${relPath}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  }, 25000);
  if (!r.ok) throw new Error(`fast source ${relPath} HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
}

function normalizePrograms(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(p => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number')
    .map(p => ({ start: p[0], title: String(p[1]) }))
    .sort((a, b) => a.start - b.start);
}

function epgFromPrograms(programs) {
  const list = Array.isArray(programs) ? programs : [];
  const now = Math.floor(Date.now() / 1000);
  let curIdx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].start <= now) curIdx = i;
    else break;
  }
  if (curIdx < 0) return {};
  const out = { current: list[curIdx] };
  if (curIdx + 1 < list.length) out.next = list[curIdx + 1];
  return out;
}

function fmtEpoch(ts) {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
    }).format(new Date(ts * 1000));
  } catch (e) {
    return '';
  }
}

function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function loadPluto() {
  return cachedLoad('pluto', async () => {
    let list = null;
    try {
      const r = await fetchWithTimeout('https://api.pluto.tv/v2/channels.json', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }, 25000);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j) && j.some(c => c && c.category === 'Intrattenimento')) list = j;
      }
    } catch (e) { /* fallback snapshot */ }
    if (!list) {
      list = require('./pluto_channels_it.json');
    }

    const epgByName = new Map();
    try {
      const j = await fetchGzJson(PLUTO_PATH);
      const chs = (j.regions && j.regions.it && j.regions.it.channels) || {};
      for (const c of Object.values(chs)) {
        if (c && c.name) epgByName.set(normName(c.name), normalizePrograms(c.programs));
      }
    } catch (e) { /* EPG opzionale */ }

    return list.filter(c => c && c._id && c.name).map(c => ({
      provider: 'pluto',
      id: c._id,
      name: c.name,
      number: c.number || null,
      group: c.category || 'Altro',
      logo: (c.colorLogoPNG && c.colorLogoPNG.path) || (c.logo && c.logo.path) || null,
      art: c.featuredImage ? String(c.featuredImage.path).split('?')[0] : null,
      desc: c.summary || '',
      programs: epgByName.get(normName(c.name)) || []
    })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  });
}

function loadSamsung() {
  return cachedLoad('samsung', async () => {
    const j = await fetchGzJson(SAMSUNG_PATH);
    const chs = (j.regions && j.regions.it && j.regions.it.channels) || {};
    return Object.entries(chs).map(([id, c]) => ({
      provider: 'samsung',
      id,
      name: c.name,
      number: c.chno || null,
      group: c.group || 'Altro',
      logo: c.logo || null,
      art: null,
      desc: c.description || '',
      programs: normalizePrograms(c.programs)
    })).sort((a, b) => (a.number || 99999) - (b.number || 99999));
  });
}

async function loadRakuten() {
  return cachedLoad('rakuten', async () => {
    let all = [];
    for (let p = 1; p <= 8; p++) {
      const r = await fetchWithTimeout(
        `https://gizmo.rakuten.tv/v3/live_channels?${RAKUTEN_QUERY}&per_page=20&page=${p}`,
        { headers: RAKUTEN_HEADERS }, 20000
      );
      if (!r.ok) break;
      const j = await r.json();
      all = all.concat(j.data || []);
      const pg = j.meta && j.meta.pagination;
      if (!pg || p >= pg.total_pages) break;
    }
    const catMap = {};
    try {
      const rc = await fetchWithTimeout(
        `https://gizmo.rakuten.tv/v3/live_channel_categories?${RAKUTEN_QUERY}`,
        { headers: RAKUTEN_HEADERS }, 20000
      );
      if (rc.ok) {
        const jc = await rc.json();
        (jc.data || []).forEach(cat => (cat.live_channels || []).forEach(id => { catMap[id] = cat.name; }));
      }
    } catch (e) { /* categorie opzionali */ }

    return all.map(c => ({
      provider: 'rakuten',
      id: c.id,
      name: c.title,
      number: typeof c.channel_number === 'number' ? c.channel_number : (c.numerical_id || null),
      group: catMap[c.id] || 'Altro',
      logo: (c.images && (c.images.artwork || c.images.thumbnail)) || null,
      art: (c.images && c.images.artwork) || null,
      desc: ((c.labels && c.labels.tags) || []).map(t => t.name).join(', '),
      languages: ((c.labels && c.labels.languages) || []).map(l => l.id).filter(Boolean),
      programs: []
    })).sort((a, b) => (a.number || 9999) - (b.number || 9999));
  });
}

async function rakutenStreamUrl(ch) {
  const cacheKey = 'rakstream:' + ch.id;
  const hit = streamCache.get(cacheKey);
  if (hit) return hit;

  const q = new URLSearchParams({
    classification_id: '36',
    device_identifier: 'web',
    device_stream_audio_quality: '2.0',
    device_stream_hdr_type: 'NONE',
    device_stream_video_quality: 'FHD',
    disable_dash_legacy_packages: 'false',
    locale: 'it',
    market_code: 'it'
  });
  const body = {
    audio_language: (ch.languages && ch.languages[0]) || 'ITA',
    audio_quality: '2.0',
    classification_id: '36',
    content_id: ch.id,
    content_type: 'live_channels',
    device_serial: 'not implemented',
    player: 'web:HLS-NONE:NONE',
    strict_video_quality: false,
    subtitle_language: 'MIS',
    video_type: 'stream'
  };
  const r = await fetchWithTimeout(`https://gizmo.rakuten.tv/v3/avod/streamings?${q.toString()}`, {
    method: 'POST',
    headers: { ...RAKUTEN_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 25000);
  if (!r.ok) throw new Error(`rakuten streaming HTTP ${r.status}`);
  const j = await r.json();
  const si = j.data && j.data.stream_infos && j.data.stream_infos[0];
  if (!si || !si.url) throw new Error('rakuten: no stream url');
  const url = String(si.url).split('.m3u8')[0] + '.m3u8';
  streamCache.set(cacheKey, url);
  return url;
}

async function guidatvEpgFor(name) {
  try {
    const catalogs = require('./catalogs');
    const uni = await catalogs.buildUniverse();
    const key = canonicalKey(name);
    const c = uni.channels.find(u => u.key === key);
    if (!c || !c.epg || !c.epg.current) return {};
    return {
      current: c.epg.current ? { title: c.epg.current.title, startIso: c.epg.current.start, endIso: c.epg.current.end } : null,
      next: c.epg.next ? { title: c.epg.next.title, startIso: c.epg.next.start, endIso: c.epg.next.end } : null
    };
  } catch (e) {
    return {};
  }
}

const plutoSessions = new Map();
let plutoBootChain = Promise.resolve();

async function bootPlutoSession() {
  const q = new URLSearchParams({
    appName: 'web',
    appVersion: '9.19.0',
    deviceVersion: '120.0',
    deviceModel: 'web',
    deviceMake: 'chrome',
    deviceType: 'web',
    clientVersion: '9.19.0',
    clientID: 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f7a8',
    clientModelNumber: '1.0',
    serverSideAds: 'true'
  });
  const r = await fetchWithTimeout('https://boot.pluto.tv/v4/start?' + q.toString(), {}, 25000);
  if (!r.ok) throw new Error(`pluto boot HTTP ${r.status}`);
  const j = await r.json();
  if (!j.stitcherParams || !j.sessionToken) throw new Error('pluto boot: missing token');
  return { params: String(j.stitcherParams), jwt: String(j.sessionToken), at: Date.now() };
}

async function getPlutoStitcherParams(id) {
  const TTL = 23 * 60 * 60 * 1000;
  const cur = plutoSessions.get(id);
  if (cur && Date.now() - cur.at < TTL) return cur;
  const prev = plutoBootChain;
  let gate;
  plutoBootChain = new Promise(res => { gate = res; });
  await prev.catch(() => {});
  try {
    const again = plutoSessions.get(id);
    if (again && Date.now() - again.at < TTL) return again;
    const s = await bootPlutoSession();
    plutoSessions.set(id, s);
    return s;
  } finally {
    gate();
  }
}

async function plutoStreamUrl(id) {
  const s = await getPlutoStitcherParams(id);
  return `https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv/v2/stitch/hls/channel/${id}/master.m3u8?${s.params}&jwt=${encodeURIComponent(s.jwt)}&masterJWTPassthrough=true`;
}

async function plutoVariants(id) {
  try {
    const url = await plutoStreamUrl(id);
    return [{ label: null, url }];
  } catch (e) {
    return [];
  }
}

function samsungStreamUrl(id) {
  return `https://jmp2.uk/stvp-${id}`;
}

function providerLabel(provider) {
  return provider === 'pluto' ? 'Pluto TV'
    : provider === 'samsung' ? 'Samsung TV Plus'
    : 'Rakuten TV';
}

function b64uEnc(s) {
  return Buffer.from(String(s), 'utf8').toString('base64url');
}

function b64uDec(s) {
  return Buffer.from(String(s), 'base64url').toString('utf8');
}

function rewriteM3U8(text, upstreamUrl, base) {
  const out = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      out.push(line.replace(/URI="([^"]+)"/g, (m, u) => {
        try { return `URI="${base}/pp/${b64uEnc(new URL(u, upstreamUrl).href)}"`; }
        catch (e) { return m; }
      }));
    } else {
      try { out.push(`${base}/pp/${b64uEnc(new URL(line, upstreamUrl).href)}`); }
      catch (e) { out.push(line); }
    }
  }
  return out.join('\n') + '\n';
}

function providerPrefix(provider) {
  return provider === 'pluto' ? PLUTO_PREFIX
    : provider === 'samsung' ? SAMSUNG_PREFIX
    : RAKUTEN_PREFIX;
}

async function fastToMeta(ch) {
  const epg = ch.programs.length
    ? epgFromPrograms(ch.programs)
    : (ch.provider === 'rakuten' ? await guidatvEpgFor(ch.name) : {});
  const parts = [];
  if (epg.current) {
    parts.push(`IN ONDA ORA: ${epg.current.title}`);
    if (epg.current.start != null && epg.next) {
      const a = typeof epg.current.start === 'number' ? fmtEpoch(epg.current.start) : fmtRome(epg.current.startIso || epg.current.start);
      const b = typeof epg.next.start === 'number' ? fmtEpoch(epg.next.start) : fmtRome(epg.next.startIso || epg.next.start);
      parts.push(`Orario: ${a} - ${b}`);
    }
  }
  if (epg.next) {
    const t = typeof epg.next.start === 'number' ? fmtEpoch(epg.next.start) : fmtRome(epg.next.startIso || epg.next.start);
    parts.push(`Poi: ${epg.next.title} • ${t}`);
  }
  if (!parts.length && ch.desc) parts.push(ch.desc.slice(0, 300));

  return {
    id: `${providerPrefix(ch.provider)}:${ch.id}`,
    type: 'tv',
    name: ch.name,
    poster: ch.logo || undefined,
    posterShape: ch.provider === 'rakuten' ? 'poster' : 'square',
    background: ch.art || ch.logo || undefined,
    logo: ch.logo || undefined,
    description: parts.join('\n') || ch.name,
    releaseInfo: ch.number != null && ch.number !== '' ? `Ch. ${ch.number}` : undefined,
    genres: [ch.group],
    behaviorHints: { defaultsRecommended: true }
  };
}

async function fastStreams(ch, baseUrl) {
  const label = providerLabel(ch.provider);
  const epg = ch.programs.length
    ? epgFromPrograms(ch.programs)
    : (ch.provider === 'rakuten' ? await guidatvEpgFor(ch.name) : {});
  const titleParts = [];
  if (epg.current) titleParts.push(`IN ONDA: ${epg.current.title}`);
  if (epg.next) {
    const t = typeof epg.next.start === 'number' ? fmtEpoch(epg.next.start) : fmtRome(epg.next.startIso || epg.next.start);
    titleParts.push(`Poi: ${epg.next.title}${t ? ' • ' + t : ''}`);
  }
  let variants;
  if (ch.provider === 'pluto') {
    const vs = await plutoVariants(ch.id);
    if (baseUrl) {
      variants = vs.map(v => ({ label: v.label, url: `${baseUrl.replace(/\/+$/, '')}/pp/${b64uEnc(v.url)}` }));
    } else {
      variants = vs;
    }
  } else {
    const u = ch.provider === 'samsung' ? samsungStreamUrl(ch.id) : await rakutenStreamUrl(ch);
    variants = [{ label: null, url: u }];
  }

  return variants.map((v) => {
    const hdrs = v.headers || null;
    const stream = {
      name: v.label ? `${label} • ${v.label}` : label,
      title: (titleParts.length ? titleParts.join(' | ') : ch.name),
      description: v.label
        ? `via ${label} • sessione ${v.label}${ch.number != null && ch.number !== '' ? ` • Ch. ${ch.number}` : ''}`
        : `via ${label}${ch.number != null && ch.number !== '' ? ` • Ch. ${ch.number}` : ''}`,
      url: v.url,
      behaviorHints: { notWebReady: false }
    };
    if (hdrs) {
      stream.headers = hdrs;
      stream.behaviorHints.headers = hdrs;
      stream.behaviorHints.proxyHeaders = { request: hdrs };
    }
    return stream;
  });
}

async function catalogChannels(provider) {
  if (provider === 'pluto') return loadPluto();
  if (provider === 'samsung') return loadSamsung();
  return loadRakuten();
}

async function catalogMetas(provider, genre, search) {
  const channels = await catalogChannels(provider);
  let list = channels;
  if (genre && genre !== 'Tutti') {
    list = list.filter(c => c.group === genre);
  }
  if (search) {
    const s = String(search).toLowerCase();
    list = list.filter(c => c.name.toLowerCase().includes(s));
  }
  return Promise.all(list.map(fastToMeta));
}

async function resolveFastId(id) {
  for (const [prefix, provider] of [
    [PLUTO_PREFIX, 'pluto'],
    [SAMSUNG_PREFIX, 'samsung'],
    [RAKUTEN_PREFIX, 'rakuten']
  ]) {
    if (id.startsWith(prefix + ':')) {
      const chId = id.slice(prefix.length + 1);
      const channels = await catalogChannels(provider);
      return channels.find(c => c.id === chId) || null;
    }
  }
  return null;
}

async function metaById(id) {
  const ch = await resolveFastId(id);
  return ch ? fastToMeta(ch) : null;
}

async function streamsById(id, clientIp, baseUrl) {
  const ch = await resolveFastId(id);
  return ch ? fastStreams(ch, baseUrl) : [];
}

async function genreOptions(provider) {
  try {
    const channels = await catalogChannels(provider);
    return ['Tutti', ...[...new Set(channels.map(c => c.group))]];
  } catch (e) {
    return ['Tutti'];
  }
}

module.exports = {
  PLUTO_PREFIX, SAMSUNG_PREFIX, EXTRA_PREFIX, RAKUTEN_PREFIX,
  CATALOG_PLUTO, CATALOG_SAMSUNG, CATALOG_EXTRA, CATALOG_RAKUTEN,
  loadPluto, loadSamsung, loadRakuten, epgFromPrograms, fmtEpoch,
  plutoStreamUrl, plutoVariants, samsungStreamUrl, rakutenStreamUrl,
  fastToMeta, fastStreams,
  catalogMetas, metaById, streamsById, genreOptions,
  b64uEnc, b64uDec, rewriteM3U8
};
