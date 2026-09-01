'use strict';

const fs = require('fs');
const path = require('path');
const { TTLCache, fetchWithTimeout, fmtRome } = require('./util');

const PLEX_PREFIX = 'nuvio-plex';
const CATALOG_PLEX = 'plex_livetv';

const EPG_BASE = 'https://epg.provider.plex.tv';
const LUMA_BASE = 'https://luma.plex.tv';

const SNAPSHOT = path.join(__dirname, 'plex_channels_it.json');

function token() {
  return process.env.PLEX_TOKEN || '';
}

function isEnabled() {
  return !!token();
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

function loadSnapshot() {
  try {
    const j = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    if (Array.isArray(j)) return j;
  } catch (e) { /* vuoto */ }
  return [];
}

// Optional live refresh of airings per channel (kept small, best-effort).
const airingCache = new TTLCache(5 * 60 * 1000);
const inflight = new Map();
async function fetchAirings(chId) {
  if (!token()) return null;
  const hit = airingCache.get(chId);
  if (hit) return hit;
  if (inflight.has(chId)) return inflight.get(chId);
  const p = (async () => {
    const ch = chId.split('-').pop();
    const pl = '00000000-0000-0000-0000-000000000000';
    const url = `${LUMA_BASE}/api/fragment/live-tv/airings/${ch}?metrics.page=live-tv.guide&metrics.pageLoadID=${pl}&screen.type=Custom`;
    const r = await fetchWithTimeout(url, {
      headers: { 'X-Plex-Token': token(), 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    }, 15000);
    if (!r.ok) throw new Error(`plex airings HTTP ${r.status}`);
    return await r.json();
  })().then(d => {
    airingCache.set(chId, d);
    inflight.delete(chId);
    return d;
  }).catch(e => {
    inflight.delete(chId);
    throw e;
  });
  inflight.set(chId, p);
  return p;
}

function airingsToEpg(airings) {
  const now = Math.floor(Date.now() / 1000);
  const list = (Array.isArray(airings) ? airings : []).sort((a, b) => (a.beginsAt || 0) - (b.beginsAt || 0));
  let cur = null, next = null;
  for (const a of list) {
    if ((a.beginsAt || 0) <= now) cur = a;
    else { next = a; break; }
  }
  const shape = (a) => a ? { title: a.title, sub: (a.previewData && a.previewData.subtitle) || null, startIso: new Date(a.beginsAt * 1000).toISOString(), endIso: a.endsAt ? new Date(a.endsAt * 1000).toISOString() : null } : null;
  return { current: shape(cur), next: shape(next) };
}

async function channelEpg(sn) {
  // prefer snapshot embedded EPG, then try live airings (best effort)
  const now = Math.floor(Date.now() / 1000);
  if (sn.current && sn.current.s <= now && now < (sn.current.e || Infinity)) {
    return { current: { title: sn.current.t, start: sn.current.s, end: sn.current.e, sub: sn.current.sub }, next: sn.next ? { title: sn.next.t, start: sn.next.s } : null };
  }
  try {
    const d = await fetchAirings(sn.id);
    const epg = airingsToEpg(d.airings);
    if (epg.current) return epg;
  } catch (e) { /* fallback */ }
  return { current: sn.current ? { title: sn.current.t, start: sn.current.s, end: sn.current.e, sub: sn.current.sub } : null, next: sn.next ? { title: sn.next.t, start: sn.next.s } : null };
}

function streamUrlFor(id) {
  return `${EPG_BASE}/library/parts/${id}.m3u8?X-Plex-Token=${encodeURIComponent(token())}`;
}

async function plexToMeta(sn) {
  const epg = await channelEpg(sn);
  const parts = [];
  if (epg.current) {
    const t = epg.current.sub ? `${epg.current.title} — ${epg.current.sub}` : epg.current.title;
    parts.push(`IN ONDA ORA: ${t}`);
    if (epg.current.start != null && epg.next) {
      const a = typeof epg.current.start === 'number' ? fmtEpoch(epg.current.start) : fmtRome(epg.current.startIso || epg.current.start);
      const b = typeof epg.next.start === 'number' ? fmtEpoch(epg.next.start) : fmtRome(epg.next.startIso || epg.next.start);
      parts.push(`Orario: ${a} - ${b}`);
    }
  }
  if (epg.next) {
    const t = epg.next.sub ? `${epg.next.title} — ${epg.next.sub}` : epg.next.title;
    parts.push(`Poi: ${t}`);
  }
  return {
    id: `${PLEX_PREFIX}:${sn.id}`,
    type: 'tv',
    name: sn.name,
    poster: sn.logo || undefined,
    background: sn.logo || undefined,
    logo: sn.logo || undefined,
    description: parts.join('\n') || sn.name,
    genres: [sn.group || 'Live'],
    behaviorHints: { defaultsRecommended: true }
  };
}

async function plexMetas(search) {
  let list = loadSnapshot();
  if (search) {
    const s = String(search).toLowerCase();
    list = list.filter(c => c.name.toLowerCase().includes(s));
  }
  return Promise.all(list.map(plexToMeta));
}

async function plexMeta(id) {
  if (!id.startsWith(PLEX_PREFIX + ':')) return null;
  const chId = id.slice(PLEX_PREFIX.length + 1);
  const sn = loadSnapshot().find(c => c.id === chId);
  if (!sn) return null;
  return plexToMeta(sn);
}

async function plexStreams(id) {
  if (!id.startsWith(PLEX_PREFIX + ':')) return [];
  const chId = id.slice(PLEX_PREFIX.length + 1);
  const sn = loadSnapshot().find(c => c.id === chId);
  if (!sn || !token()) return [];
  const epg = await channelEpg(sn);
  const titleParts = [];
  if (epg.current) titleParts.push(`IN ONDA: ${epg.current.title}`);
  const url = streamUrlFor(chId);
  return [{
    name: 'Plex Live TV',
    title: (titleParts.length ? titleParts.join(' | ') : sn.name),
    description: 'via Plex Live TV',
    url,
    behaviorHints: { notWebReady: false }
  }];
}

function genreOptions() {
  const set = new Set();
  for (const c of loadSnapshot()) if (c.group) set.add(c.group);
  return ['Tutti', ...set];
}

function flushDataCaches() {
  airingCache.map.clear();
  inflight.clear();
}

module.exports = {
  PLEX_PREFIX, CATALOG_PLEX, isEnabled,
  plexMetas, plexMeta, plexStreams, genreOptions, flushDataCaches
};