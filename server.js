'use strict';

const http = require('http');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const pkg = require('./package.json');
const catalogs = require('./lib/catalogs');
const guidatv = require('./lib/guidatv');
const m3u = require('./lib/m3u');
const fast = require('./lib/fast');
const sport = require('./lib/sport');
const logger = require('./lib/log');

const PORT = process.env.PORT || 7000;
const HOST = process.env.HOST || '0.0.0.0';
const ADDON_ID = 'community.tvvooguide.nuvio';

const CONFIGURE_HTML = fs.readFileSync(path.join(__dirname, 'public', 'configure.html'), 'utf8');

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'max-age=60'
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, { error: message }, status);
}

function clientIpFrom(req) {
  const cfc = req.headers['cf-connecting-ip'];
  if (cfc) return String(cfc).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']).trim();
  return null;
}

async function buildManifest() {
  const genres = catalogs.genreOptions();
  const plutoGenres = await fast.genreOptions('pluto');
  const samsungGenres = await fast.genreOptions('samsung');
  const rakutenGenres = await fast.genreOptions('rakuten');
  return {
    id: ADDON_ID,
    version: pkg.version,
    name: 'TvVoo Guide • Italia',
    description: 'Canali TV italiani (VAVOO) con guida TV in tempo reale da GuidaTV: programma in onda, orari di inizio/fine e successivo. Categorie Sky incluse. In più: Samsung TV Plus e canali Extra.',
    logo: 'https://i.imgur.com/miRBJ2B.png',
    background: 'https://raw.githubusercontent.com/qwertyuiop8899/StreamViX/refs/heads/main/public/backround.png',
    types: ['tv'],
    idPrefixes: [catalogs.ID_PREFIX, fast.PLUTO_PREFIX, fast.SAMSUNG_PREFIX, fast.EXTRA_PREFIX, fast.RAKUTEN_PREFIX],
    resources: ['catalog', 'meta', 'stream'],
    catalogs: [
      {
        id: 'tvvoo_it_epg',
        type: 'tv',
        name: 'TvVoo • Ora in TV',
        extra: [
          { name: 'genre', options: genres, isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        id: 'tvvoo_it_search',
        type: 'tv',
        name: '\uD83D\uDD0E Cerca canale / programma',
        extra: [{ name: 'search', isRequired: true }]
      },
      {
        id: fast.CATALOG_PLUTO,
        type: 'tv',
        name: 'Pluto TV',
        extra: [
          { name: 'genre', options: plutoGenres, isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        id: fast.CATALOG_SAMSUNG,
        type: 'tv',
        name: 'Samsung TV Plus',
        extra: [
          { name: 'genre', options: samsungGenres, isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        id: fast.CATALOG_EXTRA,
        type: 'tv',
        name: 'Extra & Svizzera',
        extra: [
          { name: 'genre', options: ['Tutti'], isRequired: false },
          { name: 'search', isRequired: false }
        ]
      },
      {
        id: fast.CATALOG_RAKUTEN,
        type: 'tv',
        name: 'Rakuten TV',
        extra: [
          { name: 'genre', options: rakutenGenres, isRequired: false },
          { name: 'search', isRequired: false }
        ]
      }
    ],
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
}

function parsePath(urlPathname) {
  let p = urlPathname;
  if (p.startsWith('/')) p = p.slice(1);
  p = p.replace(/\/+$/, '');
  return p.split('/').filter(Boolean).map(s => decodeURIComponent(s));
}

async function handleRequest(req, res) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    return res.end();
  }

  const segments = parsePath(u.pathname);
  const clientIp = clientIpFrom(req);

  if (segments[0] !== 'debug') {
    logger.log('req', { m: req.method, p: u.pathname, ip: clientIp });
  }

  try {
    if (u.pathname === '/' || u.pathname === '/configure') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(CONFIGURE_HTML.replace(/%MANIFEST_URL%/g, `http://${req.headers.host || 'localhost:' + PORT}/manifest.json`));
    }

    if (segments[0] && segments[0].endsWith('manifest.json')) {
      return sendJson(res, await buildManifest());
    }

    if (u.pathname === '/health') {
      return sendJson(res, { ok: true, uptime: process.uptime(), version: pkg.version });
    }

    if (u.pathname === '/debug/ip') {
      return sendJson(res, { ip: clientIp, headers: req.headers });
    }

    if (u.pathname === '/debug/log') {
      return sendJson(res, { lines: logger.tail(40) });
    }

    if (u.pathname === '/debug/m3u') {
      const data = await m3u.getItalyM3U();
      return sendJson(res, { groups: data.groups, channels: data.entries.length });
    }

    if (u.pathname === '/debug/epg') {
      const piat = u.searchParams.get('piat') || 'sky_sport';
      const cat = await guidatv.getCategory(piat);
      return sendJson(res, {
        piat: cat.piat,
        displayName: cat.displayName,
        channels: cat.channels.length,
        sample: cat.channels.slice(0, 5).map(c => ({
          name: c.guidatvName,
          now: c.current ? `${c.current.title} [${c.current.start} - ${c.current.end}]` : null,
          next: c.next ? c.next.title : null
        }))
      });
    }

    if (segments[0] === 'catalog') {
      const type = segments[1];
      const catalogId = segments[2];
      let extraStr = segments.slice(3).join('/');
      extraStr = extraStr.replace(/\.json$/i, '');

      const params = new URLSearchParams(extraStr || '');
      const genre = params.get('genre') || u.searchParams.get('genre');
      const search = params.get('search') || u.searchParams.get('search');
      const skip = parseInt(u.searchParams.get('skip') || params.get('skip') || '0', 10) || 0;

      let metas;
      if (catalogId === fast.CATALOG_PLUTO) {
        metas = await fast.catalogMetas('pluto', genre, search);
      } else if (catalogId === fast.CATALOG_SAMSUNG) {
        metas = await fast.catalogMetas('samsung', genre, search);
      } else if (catalogId === fast.CATALOG_RAKUTEN) {
        metas = await fast.catalogMetas('rakuten', genre, search);
      } else if (catalogId === fast.CATALOG_EXTRA) {
        let list = await catalogs.extraMetas();
        if (search) {
          const s = String(search).toLowerCase();
          list = list.filter(m => m.name.toLowerCase().includes(s));
        }
        metas = list;
      } else if (catalogId === sport.CATALOG_ID) {
        metas = await sport.catalogMetas(search);
      } else {
        metas = await catalogs.getCatalogMetas(genre, search);
        if (/documentari/i.test(String(genre || ''))) {
          const [samDoc, rakDoc] = await Promise.all([
            fast.catalogMetas('samsung', 'Documentari', search),
            fast.catalogMetas('rakuten', 'Documentari', search)
          ]);
          const seen = new Set(metas.map(m => m.id));
          for (const m of [...(samDoc || []), ...(rakDoc || [])]) {
            if (!seen.has(m.id)) { metas.push(m); seen.add(m.id); }
          }
        }
      }
      if (skip > 0 && Array.isArray(metas)) {
        metas = metas.slice(skip);
      }
      return sendJson(res, { metas });
    }

    if (segments[0] === 'meta') {
      const type = segments[1];
      const id = segments.slice(2).join('/').replace(/\.json$/i, '');
      let meta;
      if (id.startsWith(fast.PLUTO_PREFIX + ':') || id.startsWith(fast.SAMSUNG_PREFIX + ':') || id.startsWith(fast.RAKUTEN_PREFIX + ':')) {
        meta = await fast.metaById(id);
      } else if (id.startsWith(sport.PREFIX + ':')) {
        meta = await sport.metaById(id);
      } else if (id.startsWith(fast.EXTRA_PREFIX + ':')) {
        meta = await catalogs.extraMeta(id);
      } else {
        meta = await catalogs.getMeta(id);
      }
      if (!meta) return sendError(res, 404, 'meta not found');
      return sendJson(res, { meta });
    }

    if (segments[0] === 'stream') {
      const type = segments[1];
      const id = segments.slice(2).join('/').replace(/\.json$/i, '');
      const sproto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
      const sbase = `${sproto}://${req.headers.host}`;
      let streams;
      if (id.startsWith(sport.PREFIX + ':')) {
        const sgtId = id.slice(sport.PREFIX.length + 1);
        const key = await sport.resolveChannelKey(sgtId);
        streams = key ? await catalogs.getStreams(key, clientIp) : [];
      } else if (id.startsWith(fast.PLUTO_PREFIX + ':') || id.startsWith(fast.SAMSUNG_PREFIX + ':') || id.startsWith(fast.RAKUTEN_PREFIX + ':')) {
        streams = await fast.streamsById(id, clientIp, sbase);
      } else if (id.startsWith(fast.EXTRA_PREFIX + ':')) {
        streams = await catalogs.extraStreams(id, clientIp);
      } else {
        streams = await catalogs.getStreams(id, clientIp);
      }
      return sendJson(res, { streams });
    }

    if (segments[0] === 'pp' && segments[1]) {
      const { fetchWithTimeout } = require('./lib/util');
      let up;
      try { up = fast.b64uDec(segments[1]); } catch (e) { return sendError(res, 400, 'bad token'); }
      if (!/^https:\/\//i.test(up)) return sendError(res, 400, 'bad upstream');
      const r = await fetchWithTimeout(up, {}, 30000);
      if (!r.ok) return sendError(res, 502, `upstream ${r.status}`);
      const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
      const base = `${proto}://${req.headers.host}`;
      const isPlaylist = /\.m3u8(\?|$)/i.test(up) || /mpegurl/i.test(r.headers.get('content-type') || '');
      if (isPlaylist) {
        const txt = await r.text();
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(fast.rewriteM3U8(txt, up, base));
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': r.headers.get('cache-control') || 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(buf);
    }

    sendError(res, 404, 'not found');
  } catch (e) {
    console.error(`[${new Date().toISOString()}]`, req.method, req.url, '-', e.message);
    sendError(res, 500, e.message || 'internal error');
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`TvVoo Guide addon listening on http://${HOST}:${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
});

process.on('uncaughtException', (err) => {
  try { console.error('[uncaughtException]', err); } catch (e) { /* noop */ }
});
process.on('unhandledRejection', (reason) => {
  try { console.error('[unhandledRejection]', reason); } catch (e) { /* noop */ }
});
