'use strict';

const crypto = require('crypto');
const { TTLCache, fetchWithTimeout, cleanName, WORD_NUMS } = require('./util');
const { log } = require('./log');

const DEFAULT_VAVOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
const VAVOO_PING_UA = 'electron-fetch/1.0 electron (+https://github.com/arantes555/electron-fetch)';
const VAVOO_RESOLVE_UA = 'MediaHubMX/2';
const VAVOO_TS_UA = 'VAVOO/2.6';

const TS_VEC = '9frjpxPjxSNilxJPCJ0XGYs6scej3dW/h/VWlnKUiLSG8IP7mfyDU7NirOlld+VtCKGj03XjetfliDMhIev7wcARo+YTU8KPFuVQP9E2DVXzY2BFo1NhE6qEmPfNDnm74eyl/7iFJ0EETm6XbYyz8IKBkAqPN/Spp3PZ2ulKg3QBSDxcVN4R5zRn7OsgLJ2CNTuWkd/h451lDCp+TtTuvnAEhcQckdsydFhTZCK5IiWrrTIC/d4qDXEd+GtOP4hPdoIuCaNzYfX3lLCwFENC6RZoTBYLrcKVVgbqyQZ7DnLqfLqvf3z0FVUWx9H21liGFpByzdnoxyFkue3NzrFtkRL37xkx9ITucepSYKzUVEfyBh+/3mtzKY26VIRkJFkpf8KVcCRNrTRQn47Wuq4gC7sSwT7eHCAydKSACcUMMdpPSvbvfOmIqeBNA83osX8FPFYUMZsjvYNEE3arbFiGsQlggBKgg1V3oN+5ni3Vjc5InHg/xv476LHDFnNdAJx448ph3DoAiJjr2g4ZTNynfSxdzA68qSuJY8UjyzgDjG0RIMv2h7DlQNjkAXv4k1BrPpfOiOqH67yIarNmkPIwrIV+W9TTV/yRyE1LEgOr4DK8uW2AUtHOPA2gn6P5sgFyi68w55MZBPepddfYTQ+E1N6R/hWnMYPt/i0xSUeMPekX47iucfpFBEv9Uh9zdGiEB+0P3LVMP+q+pbBU4o1NkKyY1V8wH1Wilr0a+q87kEnQ1LWYMMBhaP9yFseGSbYwdeLsX9uR1uPaN+u4woO2g8sw9Y5ze5XMgOVpFCZaut02I5k0U4WPyN5adQjG8sAzxsI3KsV04DEVymj224iqg2Lzz53Xz9yEy+7/85ILQpJ6llCyqpHLFyHq/kJxYPhDUF755WaHJEaFRPxUqbparNX+mCE9Xzy7Q/KTgAPiRS41FHXXv+7XSPp4cy9jli0BVnYf13Xsp28OGs/D8Nl3NgEn3/eUcMN80JRdsOrV62fnBVMBNf36+LbISdvsFAFr0xyuPGmlIETcFyxJkrGZnhHAxwzsvZ+Uwf8lffBfZFPRrNv+tgeeLpatVcHLHZGeTgWWml6tIHwWUqv2TVJeMkAEL5PPS4Gtbscau5HM+FEjtGS+KClfX1CNKvgYJl7mLDEf5ZYQv5kHaoQ6RcPaR6vUNn02zpq5/X3EPIgUKF0r/0ctmoT84B2J1BKfCbctdFY9br7JSJ6DvUxyde68jB+Il6qNcQwTFj4cNErk4x719Y42NoAnnQYC2/qfL/gAhJl8TKMvBt3Bno+va8ve8E0z8yEuMLUqe8OXLce6nCa+L5LYK1aBdb60BYbMeWk1qmG6Nk9OnYLhzDyrd9iHDd7X95OM6X5wiMVZRn5ebw4askTTc50xmrg4eic2U1w1JpSEjdH/u/hXrWKSMWAxaj34uQnMuWxPZEXoVxzGyuUbroXRfkhzpqmqqqOcypjsWPdq5BOUGL/Riwjm6yMI0x9kbO8+VoQ6RYfjAbxNriZ1cQ+AW1fqEgnRWXmjt4Z1M0ygUBi8w71bDML1YG6UHeC2cJ2CCCxSrfycKQhpSdI1QIuwd2eyIpd4LgwrMiY3xNWreAF+qobNxvE7ypKTISNrz0iYIhU0aKNlcGwYd0FXIRfKVBzSBe4MRK2pGLDNO6ytoHxvJweZ8h1XG8RWc4aB5gTnB7Tjiqym4b64lRdj1DPHJnzD4aqRixpXhzYzWVDN2kONCR5i2quYbnVFN4sSfLiKeOwKX4JdmzpYixNZXjLkG14seS6KR0Wl8Itp5IMIWFpnNokjRH76RYRZAcx0jP0V5/GfNNTi5QsEU98en0SiXHQGXnROiHpRUDXTl8FmJORjwXc0AjrEMuQ2FDJDmAIlKUSLhjbIiKw3iaqp5TVyXuz0ZMYBhnqhcwqULqtFSuIKpaW8FgF8QJfP2frADf4kKZG1bQ99MrRrb2A=';

const sigCache = new TTLCache(9 * 60 * 1000);
const resolveCache = new TTLCache(90 * 1000);
const catalogCache = new TTLCache(30 * 60 * 1000);
let sigInflight = null;
let catalogInflight = null;

function buildPingBody(clientIp) {
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const nowMs = Date.now();
  return {
    token: '',
    reason: 'app-focus',
    locale: 'de',
    theme: 'dark',
    metadata: {
      device: { type: 'phone', uniqueId },
      os: { name: 'android', version: '14', abis: ['arm64-v8a'], host: 'android' },
      app: { platform: 'android' },
      version: { package: 'net.vypn.app', binary: '1.4.1', js: '1.4.1' }
    },
    appFocusTime: 0,
    playerActive: false,
    playDuration: 0,
    devMode: false,
    hasAddon: true,
    castConnected: false,
    package: 'net.vypn.app',
    version: '1.4.1',
    process: 'app',
    firstAppStart: nowMs - 86400000,
    lastAppStart: nowMs,
    ipLocation: clientIp || null,
    adblockEnabled: true,
    migrationApplied: false,
    migrationTargetInstalled: false,
    proxy: { supported: ['ss'], engine: 'Mu', ssVersion: '2022', enabled: false, autoServer: true, id: '' },
    iap: { supported: false, error: '' }
  };
}

function jsonHeaders(extra) {
  return {
    'accept': 'application/json',
    'content-type': 'application/json; charset=utf-8',
    'accept-encoding': 'gzip',
    ...(extra || {})
  };
}

function rewriteSigIps(addonSig, clientIp) {
  try {
    const decoded = Buffer.from(String(addonSig), 'base64').toString('utf8');
    const sigObj = JSON.parse(decoded);
    let dataObj = {};
    try { dataObj = JSON.parse(sigObj.data || '{}'); } catch (e) { /* keep empty */ }
    const ips = Array.isArray(dataObj.ips) ? dataObj.ips : [];
    if (clientIp) {
      dataObj.ips = [clientIp, ...ips.filter(x => x && x !== clientIp)];
      if (typeof dataObj.ip === 'string') dataObj.ip = clientIp;
      sigObj.data = JSON.stringify(dataObj);
      return Buffer.from(JSON.stringify(sigObj), 'utf8').toString('base64');
    }
  } catch (e) { /* return original */ }
  return addonSig;
}

async function pingForSignature(clientIp) {
  const headers = jsonHeaders({
    'user-agent': VAVOO_PING_UA,
    'Accept-Language': 'de'
  });
  if (clientIp) {
    headers['x-forwarded-for'] = clientIp;
    headers['x-real-ip'] = clientIp;
  }

  let res = await fetchWithTimeout('https://www.vypn.net/api/app/ping', {
    method: 'POST',
    headers,
    body: JSON.stringify(buildPingBody(clientIp))
  }, 12000);

  if (!res.ok) {
    log('ping_fallback', { status: res.status, withClientIp: !!clientIp });
    const fallbackHeaders = jsonHeaders({ 'user-agent': VAVOO_PING_UA, 'Accept-Language': 'de' });
    delete fallbackHeaders['x-forwarded-for'];
    delete fallbackHeaders['x-real-ip'];
    res = await fetchWithTimeout('https://www.vypn.net/api/app/ping', {
      method: 'POST',
      headers: fallbackHeaders,
      body: JSON.stringify(buildPingBody(null))
    }, 12000);
    if (!res.ok) throw new Error('vypn ping HTTP ' + res.status);
  }

  const j = await res.json();
  const sig = j && j.addonSig ? String(j.addonSig) : null;
  if (!sig) throw new Error('vypn ping: addonSig missing');
  return rewriteSigIps(sig, clientIp);
}

async function getSignature(clientIp) {
  const cacheKey = clientIp || '_server_';
  const cached = sigCache.get(cacheKey);
  if (cached) return cached;
  if (sigInflight) return sigInflight;

  sigInflight = pingForSignature(clientIp)
    .then(sig => {
      sigCache.set(cacheKey, sig);
      return sig;
    })
    .finally(() => { sigInflight = null; });

  return sigInflight;
}

function extractResolvedUrl(j) {
  if (Array.isArray(j) && j.length && j[0] && j[0].url) return String(j[0].url);
  if (j && j.data && j.data.url) return String(j.data.url);
  if (j && j.url) return String(j.url);
  return null;
}

async function mediahubResolve(playUrl, clientIp) {
  const sig = await getSignature(clientIp);
  const headers = jsonHeaders({
    'user-agent': VAVOO_RESOLVE_UA,
    'mediahubmx-signature': sig
  });
  if (clientIp) {
    headers['x-forwarded-for'] = clientIp;
    headers['x-real-ip'] = clientIp;
  }

  const res = await fetchWithTimeout('https://vavoo.to/mediahubmx-resolve.json', {
    method: 'POST',
    headers,
    body: JSON.stringify({ language: 'de', region: 'AT', url: playUrl, clientVersion: '3.1.0' })
  }, 12000);
  if (!res.ok) throw new Error('mediahubmx-resolve HTTP ' + res.status);
  const j = await res.json();
  return extractResolvedUrl(j);
}

async function getTsSignature() {
  try {
    const res = await fetchWithTimeout('https://www.vavoo.tv/api/box/ping2', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `vec=${encodeURIComponent(TS_VEC)}`
    }, 8000);
    if (!res.ok) return null;
    const j = await res.json();
    return (j && j.response && j.response.signed) || null;
  } catch (e) {
    return null;
  }
}

async function tsFallbackUrl(vavooPlayUrl) {
  if (!vavooPlayUrl || !/vavoo-iptv/i.test(vavooPlayUrl)) return null;
  const tsSig = await getTsSignature();
  if (!tsSig) return null;
  const base = vavooPlayUrl
    .replace(/vavoo-iptv/ig, 'live2')
    .replace(/\/index\.m3u8(?:\?.*)?$/i, '')
    .replace(/\/+$/, '');
  if (!base) return null;
  const tsUrl = `${base}.ts?n=1&b=5&vavoo_auth=${encodeURIComponent(tsSig)}`;
  try {
    const probe = await fetchWithTimeout(tsUrl, {
      method: 'GET',
      headers: { 'User-Agent': VAVOO_TS_UA }
    }, 10000);
    if (!probe.ok) return null;
  } catch (e) {
    return null;
  }
  return tsUrl;
}

async function resolveVavoo(playUrl, clientIp) {
  if (!playUrl || !playUrl.includes('vavoo.to')) return null;
  const cacheKey = playUrl + '|' + (clientIp || '_server_');
  const cached = resolveCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let url = null;
  let via = null;
  let headers = null;

  try {
    url = await mediahubResolve(playUrl, clientIp);
    if (url) {
      via = 'clean';
      headers = { 'User-Agent': DEFAULT_VAVOO_UA, 'Referer': 'https://vavoo.to/', 'Origin': 'https://vavoo.to' };
    }
  } catch (e) {
    log('resolve_clean_error', { err: e.message, ip: clientIp || null });
  }

  if (!url) {
    try {
      url = await tsFallbackUrl(playUrl);
      if (url) {
        via = 'ts';
        headers = { 'User-Agent': VAVOO_TS_UA };
      }
    } catch (e) { /* ignore */ }
  }

  log('resolve', {
    ip: clientIp || null,
    play: playUrl.slice(0, 60),
    ok: !!url,
    via,
    host: url ? (url.match(/^https?:\/\/[^/]+/) || [''])[0] : null
  });

  const result = url ? { url, headers } : null;
  resolveCache.set(cacheKey, result);
  return result;
}

async function getFullItalyCatalog() {
  const cached = catalogCache.get('_full_');
  if (cached) return cached;
  if (catalogInflight) return catalogInflight;

  catalogInflight = (async () => {
    const sig = await getSignature(null);
    const baseHeaders = jsonHeaders({
      'user-agent': 'okhttp/4.11.0',
      'mediahubmx-signature': sig
    });

    let all = [];
    let cursor = 0;
    let pages = 0;
    do {
      const body = {
        language: 'it', region: 'IT', catalogId: 'iptv', id: 'iptv',
        adult: false, search: '', sort: 'name', filter: { group: 'Italy' },
        cursor, clientVersion: '3.1.0'
      };
      const res = await fetchWithTimeout('https://vavoo.to/mediahubmx-catalog.json', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(body)
      }, 12000);
      if (!res.ok) throw new Error('mediahubmx-catalog HTTP ' + res.status);
      const j = await res.json();
      all = all.concat(Array.isArray(j.items) ? j.items : []);
      cursor = j.nextCursor || 0;
      pages++;
    } while (cursor && pages < 8);

    const items = all
      .filter(it => it && it.name && it.url)
      .map(it => ({
        name: String(it.name).replace(/\s*\.[a-z]+\s*$/i, '').trim(),
        url: String(it.url)
      }))
      .filter(it => it.name);

    catalogCache.set('_full_', items);
    return items;
  })();

  try {
    return await catalogInflight;
  } finally {
    catalogInflight = null;
  }
}

function similarity(a, b) {
  const norm = s => cleanName(s).split(' ').filter(Boolean).map(t => WORD_NUMS[t] || t);
  const ta = new Set(norm(a));
  const tb = new Set(norm(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

async function findInCatalog(name) {
  try {
    const items = await getFullItalyCatalog();
    let best = null;
    let bestScore = 0;
    for (const it of items) {
      const s = similarity(it.name, name);
      if (s > bestScore) {
        bestScore = s;
        best = it;
      }
    }
    return bestScore >= 0.7 ? best : null;
  } catch (e) {
    return null;
  }
}

async function findAllInCatalog(name) {
  try {
    const items = await getFullItalyCatalog();
    return items
      .map(it => ({ it, s: similarity(it.name, name) }))
      .filter(x => x.s >= 0.7)
      .sort((a, b) => b.s - a.s)
      .map(x => x.it);
  } catch (e) {
    return [];
  }
}

async function resolveAllChannels(candidates, clientIp, fallbackName) {
  const plays = [];
  const seenPlays = new Set();

  for (const cand of candidates || []) {
    if (cand && cand.kind === 'vavoo' && cand.url && !seenPlays.has(cand.url)) {
      seenPlays.add(cand.url);
      plays.push({ url: cand.url, source: cand.rawName });
    }
  }

  if (fallbackName) {
    for (const found of await findAllInCatalog(fallbackName)) {
      if (!seenPlays.has(found.url)) {
        seenPlays.add(found.url);
        plays.push({ url: found.url, source: found.name });
      }
    }
  }

  if (!plays.length) return [];

  const results = await Promise.allSettled(plays.map(p => resolveVavoo(p.url, clientIp)));
  const out = [];
  const seenResolved = new Set();
  for (let i = 0; i < results.length && out.length < 4; i++) {
    const r = results[i].status === 'fulfilled' ? results[i].value : null;
    if (r && r.url && !seenResolved.has(r.url)) {
      seenResolved.add(r.url);
      out.push({ url: r.url, headers: r.headers, source: plays[i].source });
    }
  }
  return out;
}

async function resolveChannel(candidates, clientIp, fallbackName) {
  for (const cand of candidates) {
    try {
      if (cand.kind === 'direct') {
        return {
          url: cand.url,
          headers: { 'User-Agent': DEFAULT_VAVOO_UA },
          source: cand.rawName
        };
      }
      if (cand.kind === 'vavoo') {
        const resolved = await resolveVavoo(cand.url, clientIp);
        if (resolved) {
          return {
            url: resolved.url,
            headers: resolved.headers,
            source: cand.rawName
          };
        }
      }
    } catch (e) {
      continue;
    }
  }

  if (fallbackName) {
    const found = await findInCatalog(fallbackName);
    if (found) {
      try {
        const resolved = await resolveVavoo(found.url, clientIp);
        if (resolved) {
          return {
            url: resolved.url,
            headers: resolved.headers,
            source: found.name
          };
        }
      } catch (e) {
        /* fallthrough */
      }
    }
  }

  return null;
}

module.exports = { getSignature, resolveVavoo, resolveChannel, resolveAllChannels, getFullItalyCatalog, DEFAULT_VAVOO_UA };
