'use strict';

const { canonicalKey, tokenSet, jaccard, fmtRome, b64urlEncode, b64urlDecode } = require('./util');
const guidatv = require('./guidatv');
const m3u = require('./m3u');
const vavoo = require('./vavoo');

const ID_PREFIX = 'tvvooguide';
const ALL_PIATS = Object.keys(guidatv.PIAT_DISPLAY);

let universePromise = null;
let universeAt = 0;

function idFromName(name) {
  return ID_PREFIX + ':' + b64urlEncode(name);
}

function nameFromId(id) {
  if (!id.startsWith(ID_PREFIX + ':')) return null;
  try {
    return b64urlDecode(id.slice(ID_PREFIX.length + 1)).toString('utf8');
  } catch (e) {
    return null;
  }
}

async function getUniverse() {
  const [m3uData, guideCats] = await Promise.all([
    m3u.getItalyM3U(),
    guidatv.getAllCategories(ALL_PIATS)
  ]);

  const channelsByKey = new Map();

  for (const entry of m3uData.entries) {
    if (!entry.key || !channelsByKey.has(entry.key)) {
      if (!channelsByKey.has(entry.key)) {
        channelsByKey.set(entry.key, {
          key: entry.key,
          name: entry.baseName,
          group: entry.group,
          logo: entry.logo,
          candidates: [],
          epg: null
        });
      }
      channelsByKey.get(entry.key).candidates.push(entry);
      if (!channelsByKey.get(entry.key).logo && entry.logo) {
        channelsByKey.get(entry.key).logo = entry.logo;
      }
    }
  }

  for (const cat of guideCats) {
    for (const ch of cat.channels) {
      const key = canonicalKey(ch.guidatvName);
      if (!key) continue;
      let uni = channelsByKey.get(key);
      if (!uni) {
        uni = {
          key,
          name: ch.guidatvName,
          group: null,
          logo: ch.guidatvLogo,
          candidates: [],
          epg: null
        };
        const found = m3u.findCandidates(m3uData.byKey, key, tokenSet(ch.guidatvName), m3uData.entries);
        if (found) {
          uni.candidates = found;
          if (!uni.logo && found[0].logo) uni.logo = found[0].logo;
        }
        channelsByKey.set(key, uni);
      }
      if (ch.current || ch.next) {
        uni.epg = { current: ch.current, next: ch.next, upcoming: ch.upcoming, source: cat.displayName };
      }
      if (!uni.logo && ch.guidatvLogo) uni.logo = ch.guidatvLogo;
      if (ch.number && !uni.number) uni.number = ch.number;
    }
  }

  return { m3uData, guideCats, channels: [...channelsByKey.values()] };
}

async function buildUniverse() {
  const now = Date.now();
  if (universePromise && now - universeAt < 5 * 60 * 1000) {
    return universePromise;
  }
  universeAt = now;
  universePromise = getUniverse().catch(e => {
    universePromise = null;
    throw e;
  });
  return universePromise;
}

function genreOptions() {
  return [
    'Tutti',
    'Digitale Terrestre',
    'Sky Intrattenimento',
    'Sky Sport',
    'Sky Cinema',
    'Sky Documentari',
    'Sky News',
    'Sky Bambini',
    'Sky Musica'
  ];
}

async function getCatalogMetas(genre, search) {
  const uni = await buildUniverse();
  let channels = [];

  if (genre && genre !== 'Tutti') {
    if (genre === 'Digitale Terrestre') {
      channels = filterByPiat(uni, 'dvb');
    } else if (genre.startsWith('Sky ')) {
      const piat = Object.entries(guidatv.PIAT_DISPLAY).find(([, d]) => d === genre)?.[0];
      channels = piat ? filterByPiat(uni, piat) : [];
    } else {
      channels = uni.channels.filter(c => c.candidates.length && c.group &&
        c.group.toLowerCase() === genre.toLowerCase());
    }
  } else {
    channels = uni.channels.filter(c => c.candidates.length || c.epg);
  }

  if (search) {
    const q = search.toLowerCase();
    channels = channels.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.epg && c.epg.current && c.epg.current.title.toLowerCase().includes(q)) ||
      (c.epg && c.epg.next && c.epg.next.title.toLowerCase().includes(q))
    );
  }

  channels.sort((a, b) => {
    const aNum = a.number ? parseFloat(a.number) : Infinity;
    const bNum = b.number ? parseFloat(b.number) : Infinity;
    if (aNum !== bNum) return aNum - bNum;
    return a.name.localeCompare(b.name, 'it');
  });

  return channels.map(c => toMeta(c));
}

const GENRE_CLAIMED_KEYS = {
  sky_documentari: ['skyarte', 'history', 'discoverychannel']
};

function filterByPiat(uni, piat) {
  const cat = uni.guideCats.find(c => c.piat === piat);
  if (!cat) return [];
  const claimedElsewhere = new Set(
    Object.entries(GENRE_CLAIMED_KEYS)
      .filter(([p]) => p !== piat)
      .flatMap(([, keys]) => keys)
  );
  const out = [];
  const seen = new Set();
  for (const ch of cat.channels) {
    const key = canonicalKey(ch.guidatvName);
    if (claimedElsewhere.has(key)) continue;
    const uniCh = uni.channels.find(u => u.key === key);
    if (uniCh) {
      out.push(uniCh);
      seen.add(key);
    } else {
      out.push({
        key,
        name: ch.guidatvName,
        group: null,
        logo: ch.guidatvLogo,
        number: ch.number,
        candidates: [],
        epg: { current: ch.current, next: ch.next, upcoming: ch.upcoming, source: cat.displayName }
      });
      seen.add(key);
    }
  }
  for (const extraKey of GENRE_CLAIMED_KEYS[piat] || []) {
    if (seen.has(extraKey)) continue;
    const uniCh = uni.channels.find(u => u.key === extraKey);
    if (uniCh) {
      seen.add(extraKey);
      out.push(uniCh);
    }
  }
  return out;
}

const FALLBACK_POSTER = size => `https://placehold.co/${size}/10182e/8fc1ff.png?text=${encodeURIComponent('+')}`;

function toMeta(c) {
  const descParts = [];
  const cur = c.epg && c.epg.current;
  const nx = c.epg && c.epg.next;

  if (cur) {
    descParts.push(`IN ONDA ORA: ${cur.title}`);
    if (cur.start && cur.end) {
      descParts.push(`Orario: ${fmtRome(cur.start)} - ${fmtRome(cur.end)}`);
    }
    if (cur.category || cur.genre) {
      descParts.push(`Genere: ${[cur.category, cur.genre].filter(Boolean).join(' / ')}`);
    }
    if (nx) {
      descParts.push('');
      descParts.push(`PROSSIMO: ${nx.title}`);
      if (nx.start) {
        const endStr = nx.end ? ` - ${fmtRome(nx.end)}` : '';
        descParts.push(`Orario: ${fmtRome(nx.start)}${endStr}`);
      }
    }
  } else if (nx) {
    descParts.push(`PROSSIMAMENTE: ${nx.title}`);
    if (nx.start) {
      const endStr = nx.end ? ` - ${fmtRome(nx.end)}` : '';
      descParts.push(`Orario: ${fmtRome(nx.start)}${endStr}`);
    }
  } else {
    descParts.push('Guida TV non disponibile per questo canale.');
  }
  if (c.group) descParts.push('', `Categoria: ${c.group}`);

  const poster = c.logo || FALLBACK_POSTER('300x450');
  const background = (cur && cur.image) || c.logo || FALLBACK_POSTER('1280x720');

  return {
    id: idFromName(c.name),
    type: 'tv',
    name: c.name,
    poster,
    background,
    logo: c.logo || undefined,
    description: descParts.join('\n'),
    genres: cur ? [cur.category].filter(Boolean) : [],
    releaseInfo: c.number ? `Ch. ${c.number}` : undefined,
    behaviorHints: { defaultsRecommended: true }
  };
}

async function getMeta(id) {
  const name = nameFromId(id);
  if (!name) return null;
  const uni = await buildUniverse();
  const key = canonicalKey(name);
  let c = uni.channels.find(u => u.key === key);

  if (!c) {
    const guideCats = uni.guideCats;
    for (const cat of guideCats) {
      const ch = cat.channels.find(x => canonicalKey(x.guidatvName) === key);
      if (ch) {
        c = {
          key,
          name: ch.guidatvName,
          group: null,
          logo: ch.guidatvLogo,
          number: ch.number,
          candidates: m3u.findCandidates(uni.m3uData.byKey, key, tokenSet(ch.guidatvName), uni.m3uData.entries) || [],
          epg: { current: ch.current, next: ch.next, upcoming: ch.upcoming, source: cat.displayName }
        };
        break;
      }
    }
  }

  if (!c) return null;

  const meta = toMeta(c);
  if (c.epg && c.epg.upcoming && c.epg.upcoming.length) {
    const schedule = c.epg.upcoming.slice(0, 6).map(p => {
      const endStr = p.end ? ` - ${fmtRome(p.end)}` : '';
      return `\u2022 ${p.title} (${fmtRome(p.start)}${endStr})`;
    });
    meta.description += '\n\nPROSSIMI PROGRAMMI:\n' + schedule.join('\n');
  }
  return meta;
}

async function getStreams(id, clientIp) {
  const name = nameFromId(id);
  if (!name) return [];
  const uni = await buildUniverse();
  const key = canonicalKey(name);
  const c = uni.channels.find(u => u.key === key);
  const channelName = c ? c.name : name;
  const m3uCandidates = (c && c.candidates.length)
    ? c.candidates
    : (m3u.findCandidates(uni.m3uData.byKey, key, tokenSet(name), uni.m3uData.entries) || []);

  if (!m3uCandidates.length && !channelName) return [];

  const resolvedList = await vavoo.resolveAllChannels(m3uCandidates, clientIp, channelName);
  if (!resolvedList.length) return [];

  const cur = c && c.epg ? c.epg.current : null;
  const nx = c && c.epg ? c.epg.next : null;

  const titleParts = [];
  if (cur) {
    titleParts.push(`IN ONDA: ${cur.title}`);
    if (cur.start) titleParts.push(fmtRome(cur.start));
  }
  if (nx) {
    const nxTime = nx.start ? fmtRome(nx.start) : '';
    titleParts.push(`Poi: ${nx.title}${nxTime ? ' • ' + nxTime : ''}`);
  }
  const baseTitle = titleParts.length ? titleParts.join(' | ') : channelName;
  const multi = resolvedList.length > 1;

  return resolvedList.map((r, idx) => {
    const requestHeaders = {};
    for (const [k, v] of Object.entries(r.headers || {})) {
      if (v && k.toLowerCase() !== 'range') requestHeaders[k] = String(v);
    }
    const hasHdrs = Object.keys(requestHeaders).length > 0;

    return {
      name: 'TvVoo Guide',
      title: multi ? `${baseTitle} [${idx + 1}]` : baseTitle,
      description: multi
        ? `Link ${idx + 1} • ${r.source}`
        : (r.source !== channelName ? `via ${r.source}` : undefined),
      url: r.url,
      headers: hasHdrs ? requestHeaders : undefined,
      behaviorHints: {
        notWebReady: true,
        headers: hasHdrs ? requestHeaders : undefined,
        proxyHeaders: hasHdrs ? { request: requestHeaders } : undefined
      }
    };
  });
}

const EXTRA_KEYS = ['rsila1', 'rsila2'];
const EXTRA_PREFIX = 'nuvio-extra';

async function extraMetas() {
  const uni = await buildUniverse();
  return EXTRA_KEYS
    .map(k => uni.channels.find(u => u.key === k))
    .filter(Boolean)
    .map(c => {
      const meta = toMeta(c);
      meta.id = EXTRA_PREFIX + ':' + b64urlEncode(c.name);
      return meta;
    });
}

async function extraStreams(id, clientIp) {
  if (!id.startsWith(EXTRA_PREFIX + ':')) return [];
  const tvvooId = ID_PREFIX + ':' + id.slice(EXTRA_PREFIX.length + 1);
  return getStreams(tvvooId, clientIp);
}

async function extraMeta(id) {
  if (!id.startsWith(EXTRA_PREFIX + ':')) return null;
  const tvvooId = ID_PREFIX + ':' + id.slice(EXTRA_PREFIX.length + 1);
  const meta = await getMeta(tvvooId);
  if (meta) meta.id = id;
  return meta;
}

module.exports = { ID_PREFIX, genreOptions, getCatalogMetas, getMeta, getStreams, nameFromId, idFromName, buildUniverse, extraMetas, extraStreams, extraMeta };
