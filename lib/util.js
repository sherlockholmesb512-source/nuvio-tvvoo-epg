'use strict';

const JUNK_TOKENS = new Set(['hd', 'fhd', 'sd', 'uhd', '4k', '8k', 'h265', 'hevc']);

const ALIASES = {
  'canale20': '20mediaset',
  'mediaset27': '27twentyseven',
  'italiauno': 'italia1',
  'mediasetitaliadue': 'mediasetitalia2',
  'nickjunior': 'nickjr',
  'homeandgardentv': 'hgtv',
  'skyclassica': 'classica',
  'zonadazn': 'dazn1',
  'discovery': 'discoverychannel',
  'historychannel': 'history',
  'eight': 'tv8',
  'nine': 'nove',
  'raiuno': 'rai1',
  'raidue': 'rai2',
  'raitre': 'rai3',
  'retequattro': 'rete4',
  'lagiugno': 'la7',
  'deejaytv': 'radiodeejay',
  'capitaltv': 'radiocapital'
};

const NEVER_FUZZY = new Set([
  'skycollection|skycinemacollection',
  'skycollection|skycinemacollection2'
]);

function neverFuzzy(a, b) {
  return NEVER_FUZZY.has(`${a}|${b}`) || NEVER_FUZZY.has(`${b}|${a}`);
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanName(raw) {
  let s = String(raw || '').toLowerCase();
  s = stripAccents(s);
  s = s.replace(/\((?:d|m|mpd|h|1|2|3|4|5|backup)\)/g, ' ');
  s = s.replace(/[’'`]/g, '');
  s = s.replace(/&/g, 'e');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  s = s.trim();
  return s;
}

const WORD_NUMS = {
  uno: '1', due: '2', tre: '3', quattro: '4', cinque: '5',
  sei: '6', sette: '7', otto: '8', nove: '9', dieci: '10',
  undici: '11', dodici: '12'
};

function mapWordNums(tokens) {
  return tokens.map(t => WORD_NUMS[t] || t);
}

function canonicalKey(raw) {
  const cleaned = cleanName(raw);
  if (!cleaned) return '';
  let tokens = cleaned.split(' ').filter(Boolean);
  tokens = tokens.filter(t => !JUNK_TOKENS.has(t));
  if (!tokens.length) tokens = cleaned.split(' ').filter(Boolean);
  tokens = mapWordNums(tokens);
  let key = tokens.join('');
  if (ALIASES[key]) key = ALIASES[key];
  return key;
}

function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function tokenSet(raw) {
  return new Set(cleanName(raw).split(' ').filter(Boolean));
}

const ROME_TZ = 'Europe/Rome';
let romeFormatter = null;
function getRomeFormatter() {
  if (!romeFormatter) {
    try {
      romeFormatter = new Intl.DateTimeFormat('it-IT', {
        timeZone: ROME_TZ, hour: '2-digit', minute: '2-digit', hour12: false
      });
    } catch (e) {
      romeFormatter = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }
  return romeFormatter;
}

function fmtRome(iso) {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return getRomeFormatter().format(d).replace(':', ':');
  } catch (e) {
    return '--:--';
  }
}

function extractBalanced(text, startIdx, open, close) {
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++;
        i++;
      }
    } else if (c === open) {
      depth++;
    } else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  return null;
}

function htmlUnescape(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

class TTLCache {
  constructor(defaultTtlMs) {
    this.defaultTtlMs = defaultTtlMs;
    this.map = new Map();
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }
  set(key, value, ttlMs) {
    this.map.set(key, { value, expires: Date.now() + (ttlMs || this.defaultTtlMs) });
  }
  delete(key) { this.map.delete(key); }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  canonicalKey,
  cleanName,
  tokenSet,
  jaccard,
  neverFuzzy,
  WORD_NUMS,
  fmtRome,
  extractBalanced,
  htmlUnescape,
  b64urlEncode,
  b64urlDecode,
  TTLCache,
  fetchWithTimeout
};
