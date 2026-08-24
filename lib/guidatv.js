'use strict';

const { extractBalanced, TTLCache, fetchWithTimeout, htmlUnescape } = require('./util');

const GUIDATV_BASE = 'https://guidatv.org';
const LOGO_BASE = 'https://img-guidatv.org/loghi/b/';

const PIAT_DISPLAY = {
  dvb: 'Digitale Terrestre',
  sky_intrattenimento: 'Sky Intrattenimento',
  sky_sport: 'Sky Sport',
  sky_cinema: 'Sky Cinema',
  sky_documentari: 'Sky Documentari',
  sky_news: 'Sky News',
  sky_bambini: 'Sky Bambini',
  sky_musica: 'Sky Musica'
};

const epgCache = new TTLCache(5 * 60 * 1000);
const inflight = new Map();

function parseChannelDefObjects(payload) {
  const arraysByKey = new Map();
  let idx = 0;
  while (true) {
    const pos = payload.indexOf('"canali":{', idx);
    if (pos === -1) break;
    const objStr = extractBalanced(payload, pos + '"canali":'.length, '{', '}');
    if (objStr) {
      try {
        const obj = JSON.parse(objStr);
        for (const [key, val] of Object.entries(obj)) {
          if (Array.isArray(val) && val.length && val.every(c => c && typeof c === 'object' && !Array.isArray(c))) {
            if (!arraysByKey.has(key) || arraysByKey.get(key).length < val.length) {
              arraysByKey.set(key, val);
            }
          }
        }
      } catch (e) { /* ignore malformed segment */ }
    }
    idx = pos + 10;
  }
  return arraysByKey;
}

function parseCards(payload) {
  const cards = [];
  const re = /"canale":"\$([^"]*?:canali:([^":]+):(\d+))","prog":/g;
  let m;
  while ((m = re.exec(payload)) !== null) {
    const arrStart = m.index + m[0].length;
    if (payload[arrStart] !== '[') continue;
    const arrStr = extractBalanced(payload, arrStart, '[', ']');
    if (!arrStr) continue;
    let prog;
    try { prog = JSON.parse(arrStr); } catch (e) { continue; }
    if (!Array.isArray(prog)) continue;
    const displayKey = m[2];
    const index = parseInt(m[3], 10);
    cards.push({ displayKey, index, prog });
  }
  const seen = new Set();
  return cards.filter(c => {
    const k = c.displayKey + '#' + c.index;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function resolveChannelDefs(cards, arraysByKey, piatDisplay) {
  const out = new Array(cards.length).fill(null);
  const usedIdx = new Set();

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const arr = arraysByKey.get(card.displayKey);
    if (arr && arr[card.index]) {
      out[i] = arr[card.index];
      usedIdx.add(i);
    }
  }

  const candidates = [];
  for (const [k, arr] of arraysByKey.entries()) {
    candidates.push({ key: k, arr });
  }
  candidates.sort((a, b) => {
    const aMatch = a.key === piatDisplay ? 0 : 1;
    const bMatch = b.key === piatDisplay ? 0 : 1;
    return aMatch - bMatch || b.arr.length - a.arr.length;
  });

  for (let i = 0; i < cards.length; i++) {
    if (out[i]) continue;
    for (const cand of candidates) {
      const def = cand.arr[cards[i].index];
      if (def && def.name) { out[i] = def; break; }
    }
  }

  for (let i = 0; i < out.length; i++) {
    if (!out[i] && cards[i]) out[i] = { name: 'Canale ' + (i + 1) };
  }

  return out;
}

function splitPrograms(prog) {
  const now = Date.now();
  const times = prog.map(p => ({
    title: htmlUnescape(p.title || '').trim(),
    description: htmlUnescape(p.description || '').trim(),
    category: p.category || '',
    genre: p.genre || '',
    image: p.image || null,
    start: p.inizio ? new Date(p.inizio) : null,
    end: p.fine ? new Date(p.fine) : null,
    year: p.year || null
  })).filter(p => p.title);

  times.sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));

  let current = null;
  let currentIdx = -1;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t.start && t.end && t.start.getTime() <= now && now < t.end.getTime()) {
      current = t;
      currentIdx = i;
      break;
    }
  }

  const upcoming = [];
  if (currentIdx >= 0) {
    for (let i = currentIdx + 1; i < times.length && upcoming.length < 6; i++) {
      upcoming.push(times[i]);
    }
  } else {
    for (const t of times) {
      if (t.start && t.start.getTime() > now) {
        upcoming.push(t);
        if (upcoming.length >= 6) break;
      }
    }
  }

  return { current, next: upcoming[0] || null, upcoming };
}

async function fetchCategoryRsc(piat) {
  const url = `${GUIDATV_BASE}/ora-in-tv/${piat}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      'RSC': '1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'text/x-component'
    }
  }, 15000);
  if (!res.ok) throw new Error(`guidatv ${piat} HTTP ${res.status}`);
  return res.text();
}

async function getCategory(piat) {
  const cached = epgCache.get(piat);
  if (cached) return cached;

  if (inflight.has(piat)) return inflight.get(piat);

  const job = (async () => {
    const payload = await fetchCategoryRsc(piat);
    const arraysByKey = parseChannelDefObjects(payload);
    const cards = parseCards(payload);
    const piatDisplay = PIAT_DISPLAY[piat] || '';
    const defs = resolveChannelDefs(cards, arraysByKey, piatDisplay);

    const channels = [];
    for (let i = 0; i < cards.length; i++) {
      const def = defs[i] || {};
      const name = htmlUnescape(def.name || '').trim() || `Canale ${i + 1}`;
      const guide = {
        name,
        number: def.number != null ? String(def.number) : null,
        logo: def.logo ? LOGO_BASE + def.logo : null
      };
      channels.push({
        guidatvName: name,
        number: guide.number,
        guidatvLogo: guide.logo,
        ...splitPrograms(cards[i].prog)
      });
    }

    const result = { piat, displayName: piatDisplay || piat, channels, fetchedAt: Date.now() };
    epgCache.set(piat, result);
    inflight.delete(piat);
    return result;
  })();

  inflight.set(piat, job);
  try {
    return await job;
  } finally {
    inflight.delete(piat);
  }
}

async function getAllCategories(piats) {
  const list = piats && piats.length ? piats : Object.keys(PIAT_DISPLAY);
  const results = await Promise.allSettled(list.map(p => getCategory(p)));
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

function flushDataCaches() {
  epgCache.map.clear();
}

module.exports = { PIAT_DISPLAY, getCategory, getAllCategories, flushDataCaches };
