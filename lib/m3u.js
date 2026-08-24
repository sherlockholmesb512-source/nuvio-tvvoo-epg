'use strict';

const { canonicalKey, tokenSet, jaccard, neverFuzzy, TTLCache, fetchWithTimeout } = require('./util');

const M3U_URL = 'https://raw.githubusercontent.com/piholo/logo/main/lista.m3u';
const m3uCache = new TTLCache(6 * 60 * 60 * 1000);
let inflight = null;

const VARIANT_RE = /\s*\((?:D|M|MPD|H|1|2|3|4|5|6)\)\s*$/i;

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXTINF')) continue;
    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
    const idMatch = line.match(/tvg-id="([^"]+)"/);
    const groupMatch = line.match(/group-title="([^"]+)"/);
    const commaIdx = line.indexOf(',');
    const rawName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
    let url = '';
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (next && !next.startsWith('#')) {
        url = next;
        i++;
      }
    }
    if (!rawName || !url) continue;

    const variant = (line.match(/\((D|M|MPD|H|[1-6])\)\s*$/i) || [])[1] || null;
    const baseName = rawName.replace(VARIANT_RE, '').trim() || rawName;

    let kind = 'vavoo';
    const low = url.toLowerCase();
    if (low.includes('vavoo.to')) kind = 'vavoo';
    else if (low.endsWith('.m3u8') || low.includes('.isml') || low.includes('.m3u8?')) kind = 'direct';
    else if (low.startsWith('http')) kind = 'page';

    entries.push({
      rawName,
      baseName,
      key: canonicalKey(baseName),
      tokens: tokenSet(baseName),
      group: groupMatch ? groupMatch[1].trim() : 'Altro',
      logo: logoMatch ? logoMatch[1] : null,
      tvgId: idMatch ? idMatch[1] : null,
      variant: variant ? variant.toUpperCase() : null,
      kind,
      url
    });
  }
  return entries;
}

async function getItalyM3U() {
  const cached = m3uCache.get('it');
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetchWithTimeout(M3U_URL, {}, 15000);
    if (!res.ok) throw new Error('M3U HTTP ' + res.status);
    const text = await res.text();
    const entries = parseM3U(text);

    const byKey = new Map();
    for (const e of entries) {
      if (!e.key) continue;
      if (!byKey.has(e.key)) byKey.set(e.key, []);
      byKey.get(e.key).push(e);
    }
    for (const list of byKey.values()) {
      list.sort((a, b) => variantRank(a) - variantRank(b));
    }

    const groups = [...new Set(entries.map(e => e.group))].sort((a, b) => a.localeCompare(b, 'it'));

    const result = { entries, byKey, groups };
    m3uCache.set('it', result);
    inflight = null;
    return result;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function variantRank(e) {
  switch (e.variant) {
    case null: return 0;
    case 'MPD': return 1;
    case 'M': return 1;
    case 'D': return 2;
    default: return 3;
  }
}

function findCandidates(byKey, key, nameTokens, entries) {
  const exact = byKey.get(key);
  if (exact && exact.length) return exact;

  let best = null;
  let bestScore = 0;
  for (const [k, list] of byKey.entries()) {
    if (neverFuzzy(key, k)) continue;
    const score = jaccard(nameTokens, k.match(/[a-z0-9]+/g) || []);
    if (score > bestScore) {
      bestScore = score;
      best = list;
    }
  }
  if (best && bestScore >= 0.65) return best;
  return null;
}

function flushDataCaches() {
  m3uCache.map.clear();
}

module.exports = { getItalyM3U, findCandidates, flushDataCaches };
