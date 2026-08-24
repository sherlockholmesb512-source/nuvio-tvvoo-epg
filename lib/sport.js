'use strict';

const { TTLCache, fetchWithTimeout, canonicalKey, tokenSet, jaccard, htmlUnescape } = require('./util');

const PAGE_URL = 'https://www.superguidatv.it/ora-in-onda/sky-sport/';
const PREFIX = 'nuvio-sport';
const CATALOG_ID = 'sport_ora';
const CATALOG_NAME = 'Sport • Ora in TV';

const pageCache = new TTLCache(5 * 60 * 1000);
let inflightPage = null;

const ANCHOR_RE = /href="\/programmazione-canale\/oggi\/guida-programmi-tv-([^"'\/]+)\/[a-z0-9-]+\/(\d+)\//g;
const PROG_RE = /sgtv-font-bold"[^>]*>(\d{1,2}:\d{2})<\/p>\s*<div[^>]*>\s*<p[^>]*>([^<]+)<\/p>(?:\s*<p[^>]*>([^<]*)<\/p>)?/g;

function cleanTitle(t) {
  return String(t || '')
    .replace(/\.\.\./g, '…')
    .replace(/\s*\((?:Diretta|da \d+'\))\s*/gi, ' ')
    .replace(/…\s*\((?:Diretta|Live)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePage(html) {
  const marks = [...html.matchAll(ANCHOR_RE)];
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : Math.min(start + 80000, html.length);
    const chunk = html.slice(start, end);
    const altM = chunk.match(/alt="([^"]+)"(?:[^>]*src="([^"]+)")?/);
    const chM = chunk.match(/Ch\.\s*(\d+)/);
    const progs = [];
    let m;
    PROG_RE.lastIndex = 0;
    while ((m = PROG_RE.exec(chunk)) && progs.length < 4) {
      progs.push({
        t: m[1],
        title: htmlUnescape(cleanTitle(m[2])),
        cat: htmlUnescape(String(m[3] || '').trim())
      });
    }
    if (!progs.length) continue;
    out.push({
      sgtId: marks[i][2],
      slug: marks[i][1],
      name: altM ? htmlUnescape(altM[1]).trim() : marks[i][1],
      logo: altM && altM[2] ? altM[2] : null,
      chNum: chM ? chM[1] : null,
      programs: progs
    });
  }
  return out;
}

async function loadSport() {
  const hit = pageCache.get('page');
  if (hit) return hit;
  if (inflightPage) return inflightPage;
  inflightPage = (async () => {
    const r = await fetchWithTimeout(PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept-Language': 'it-IT,it;q=0.9'
      }
    }, 25000);
    if (!r.ok) throw new Error(`superguidatv HTTP ${r.status}`);
    const html = await r.text();
    const channels = parsePage(html);
    pageCache.set('page', channels);
    inflightPage = null;
    return channels;
  })();
  return inflightPage;
}

function matchUniverseKey(channels, name) {
  const target = canonicalKey(name);
  const tTokens = tokenSet(name);
  let best = null, bestScore = 0;
  for (const u of channels) {
    if (u.key === target) return u;
    const score = jaccard(tTokens, tokenSet(u.name));
    if (score > bestScore) { bestScore = score; best = u; }
  }
  return bestScore >= 0.45 && best ? best : null;
}

async function catalogMetas(search) {
  let list = await loadSport();
  if (search) {
    const s = String(search).toLowerCase();
    list = list.filter(c =>
      c.programs.some(p => p.title.toLowerCase().includes(s)) ||
      c.name.toLowerCase().includes(s));
  }
  return list.map(c => {
    const cur = c.programs[0];
    const next = c.programs[1];
    const parts = [`IN ONDA ORA su ${c.name}`, `Dalle ore ${cur.t}`];
    if (cur.cat) parts.push(`Categoria: ${cur.cat}`);
    if (next) parts.push(`POI alle ${next.t}: ${next.title}`);
    return {
      id: `${PREFIX}:${c.sgtId}`,
      type: 'tv',
      name: cur.title,
      poster: c.logo || undefined,
      posterShape: 'square',
      background: c.logo || undefined,
      logo: c.logo || undefined,
      description: parts.join('\n'),
      releaseInfo: c.chNum ? `Ch. ${c.chNum}` : undefined,
      genres: [cur.cat || 'Sport'],
      behaviorHints: { defaultsRecommended: true }
    };
  });
}

async function metaById(id) {
  const chs = await loadSport();
  const c = chs.find(x => x.sgtId === id);
  if (!c) return null;
  const metas = await catalogMetas();
  return metas.find(m => m.id === `${PREFIX}:${id}`) || null;
}

async function resolveChannelKey(sgtId) {
  const catalogs = require('./catalogs');
  const uni = await catalogs.buildUniverse();
  const chs = await loadSport();
  const c = chs.find(x => x.sgtId === sgtId);
  if (!c) return null;
  const u = matchUniverseKey(uni.channels, c.name);
  return u ? catalogs.idFromName(u.name) : null;
}

module.exports = {
  PREFIX, CATALOG_ID, CATALOG_NAME,
  loadSport, parsePage, cleanTitle, matchUniverseKey,
  catalogMetas, metaById, resolveChannelKey
};
