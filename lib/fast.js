'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { TTLCache, fetchWithTimeout, canonicalKey, fmtRome, tokenSet, jaccard, neverFuzzy } = require('./util');

const RAW_BASE = 'https://raw.githubusercontent.com/matthuisman/i.mjh.nz/master';
const PLUTO_PATH = 'PlutoTV/.channels.json.gz';
const SAMSUNG_PATH = 'SamsungTVPlus/.channels.json.gz';

const PLUTO_PREFIX = 'nuvio-pluto';
const SAMSUNG_PREFIX = 'nuvio-samsung';
const EXTRA_PREFIX = 'nuvio-extra';
const CATALOG_PLUTO = 'plutotv_it';
const CATALOG_SAMSUNG = 'samsungtvplus_it';
const CATALOG_EXTRA = 'extra_it';

const streamCache = new TTLCache(10 * 60 * 1000);

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

function flushDataCaches() {
  dataCache.map.clear();
  streamCache.map.clear();
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

const PLUTO_SNAPSHOT = path.join(__dirname, 'pluto_channels_it.json');
const PLUTO_SNAPSHOT_FRESH = path.join(__dirname, 'pluto_channels_it.fresh.json');

function savePlutoSnapshot(raw) {
  try {
    fs.writeFile(PLUTO_SNAPSHOT_FRESH, JSON.stringify(raw), () => {});
  } catch (e) { /* best effort */ }
}

function loadPlutoSnapshot() {
  for (const p of [PLUTO_SNAPSHOT_FRESH, PLUTO_SNAPSHOT]) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(j) && j.some(c => c && c._id && c.category === 'Intrattenimento')) return j;
    } catch (e) { /* prossimo candidato */ }
  }
  return null;
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
        if (Array.isArray(j) && j.some(c => c && c.category === 'Intrattenimento')) {
          list = j;
          savePlutoSnapshot(j);
        }
      }
    } catch (e) { /* fallback snapshot */ }
    if (!list) list = loadPlutoSnapshot();

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

async function guidatvEpgFor(name) {
  try {
    const catalogs = require('./catalogs');
    const uni = await catalogs.buildUniverse();
    const variants = nameVariants(name);
    for (const v of variants) {
      const key = canonicalKey(v);
      const c = uni.channels.find(u => u.key === key);
      if (c && c.epg && c.epg.current) return shapeUniEpg(c);
    }
    const base = variants[0] || name;
    const targetKey = canonicalKey(base);
    const targetTokens = tokenSet(base);
    let best = null, bestScore = 0;
    for (const u of uni.channels) {
      if (!u.key || !u.epg || !u.epg.current) continue;
      if (neverFuzzy(targetKey, u.key)) continue;
      const s = jaccard(targetTokens, tokenSet(u.key));
      if (s > bestScore) { bestScore = s; best = u; }
    }
    const min = targetTokens.size >= 2 ? 0.55 : 0.9;
    if (best && bestScore >= min) return shapeUniEpg(best);
    return {};
  } catch (e) {
    return {};
  }
}

function shapeUniEpg(c) {
  return {
    current: { title: c.epg.current.title, startIso: c.epg.current.start, endIso: c.epg.current.end, imageIso: c.epg.current.image },
    next: c.epg.next ? { title: c.epg.next.title, startIso: c.epg.next.start, endIso: c.epg.next.end } : null
  };
}

function nameVariants(n) {
  const out = [];
  const push = x => { x = String(x || '').trim(); if (x && !out.includes(x)) out.push(x); };
  let s = String(n || '').trim();
  push(s);
  push(s.replace(/\s*[-–]?\s*(HD|FHD|4K|UHD)(\+)?\s*$/i, ''));
  return out;
}

async function epgPool() {
  return cachedLoad('epgp', async () => {
    const pool = new Map();
    for (const p of [PLUTO_PATH, SAMSUNG_PATH]) {
      try {
        const j = await fetchGzJson(p);
        const chs = (j.regions && j.regions.it && j.regions.it.channels) || {};
        for (const c of Object.values(chs)) {
          if (!c || !c.name) continue;
          const k = normName(c.name);
          if (!k || pool.has(k)) continue;
          const progs = normalizePrograms(c.programs);
          if (!progs.length) continue;
          const e = epgFromPrograms(progs);
          if (e.current) pool.set(k, e);
        }
      } catch (e) { /* sorgente opzionale */ }
    }
    try {
      const catalogs = require('./catalogs');
      const uni = await catalogs.buildUniverse();
      for (const u of uni.channels) {
        const k = normName(u.name);
        if (!k || pool.has(k)) continue;
        if (u.epg && u.epg.current && u.epg.current.title) {
          pool.set(k, {
            current: { title: u.epg.current.title, startIso: u.epg.current.start, endIso: u.epg.current.end, imageIso: u.epg.current.image },
            next: u.epg.next && u.epg.next.title ? { title: u.epg.next.title, startIso: u.epg.next.start } : null
          });
        }
      }
    } catch (e) { /* opzionale */ }
    return pool;
  });
}

async function lookupEpg(name) {
  try {
    const pool = await epgPool();
    for (const v of nameVariants(name)) {
      const hit = pool.get(normName(v));
      if (hit) return hit;
    }
    return {};
  } catch (e) {
    return {};
  }
}

async function chEpg(ch) {
  if (ch.programs && ch.programs.length) return epgFromPrograms(ch.programs);
  return lookupEpg(ch.name);
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

function dropPlutoStitcherParams(id) {
  plutoSessions.delete(id);
}

function plutoQuery(s, master) {
  let q = s.params + '&jwt=' + encodeURIComponent(s.jwt);
  if (master) q += '&masterJWTPassthrough=true';
  return q;
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
    : 'Samsung TV Plus';
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
    : SAMSUNG_PREFIX;
}

async function fastToMeta(ch) {
  const epg = await chEpg(ch);
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
  const epg = await chEpg(ch);
  const titleParts = [];
  if (epg.current) titleParts.push(`IN ONDA: ${epg.current.title}`);
  if (epg.next) {
    const t = typeof epg.next.start === 'number' ? fmtEpoch(epg.next.start) : fmtRome(epg.next.startIso || epg.next.start);
    titleParts.push(`Poi: ${epg.next.title}${t ? ' • ' + t : ''}`);
  }
  let variants;
  if (ch.provider === 'pluto') {
    if (baseUrl) {
      variants = [{ label: null, url: `${baseUrl.replace(/\/+$/, '')}/pluto/${ch.id}/master.m3u8` }];
    } else {
      const vs = await plutoVariants(ch.id);
      variants = vs;
    }
  } else {
    const u = samsungStreamUrl(ch.id);
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
  return loadSamsung();
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
    [SAMSUNG_PREFIX, 'samsung']
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
  PLUTO_PREFIX, SAMSUNG_PREFIX, EXTRA_PREFIX,
  CATALOG_PLUTO, CATALOG_SAMSUNG, CATALOG_EXTRA,
  loadPluto, loadSamsung, epgFromPrograms, fmtEpoch,
  plutoStreamUrl, plutoVariants, samsungStreamUrl,
  getPlutoStitcherParams, dropPlutoStitcherParams, plutoQuery, chEpg, flushDataCaches, guidatvEpgFor,
  fastToMeta, fastStreams,
  catalogMetas, metaById, streamsById, genreOptions,
  b64uEnc, b64uDec, rewriteM3U8
};
