const fs = require('fs');
const zlib = require('zlib');

(async () => {
  // 1. guarda come decodifica lo script python
  const s = fs.readFileSync(process.env.TEMP + '\\lg_iniciar.py', 'utf8');
  const lines = s.split('\n');
  console.log('=== righe 45-80 dello script ===');
  for (let i = 44; i < 80 && i < lines.length; i++) console.log(String(i + 1).padStart(3), lines[i].slice(0, 130));

  // 2. prova a decodificare la risposta US
  console.log('\n=== test decodifica US ===');
  const now = new Date();
  const fmt = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const qs = new URLSearchParams({
    region: 'US', language: 'en',
    startTime: fmt(new Date(now.getTime() - 3600 * 1000)),
    endTime: fmt(new Date(now.getTime() + 3600 * 1000))
  });
  const r = await fetch('https://api.lgchannels.com/api/v1.0/schedulelist?' + qs.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36',
      'X-Device-Country': 'US',
      'X-Device-Language': 'en',
      'X-Authentication': 'lg-tv-services-key'
    },
    signal: AbortSignal.timeout(30000)
  });
  const t = await r.text();
  console.log('status:', r.status, '| len:', t.length, '| inizio:', t.slice(0, 40));
  if (!r.ok) { console.log(t.slice(0, 200)); return; }
  let j;
  try { j = JSON.parse(t); } catch (e) {
    // base64 -> inflate
    const buf = Buffer.from(t.trim(), 'base64');
    try {
      const out = zlib.inflateSync(buf).toString('utf8');
      j = JSON.parse(out);
      console.log('decodificato inflate! len:', out.length);
    } catch (e2) {
      try {
        const out = zlib.gunzipSync(buf).toString('utf8');
        j = JSON.parse(out);
        console.log('decodificato gunzip! len:', out.length);
      } catch (e3) { console.log('decode fallita:', e3.message.slice(0, 80)); return; }
    }
  }
  const keys = Object.keys(j);
  console.log('chiavi:', keys.join(','));
  const arrKey = keys.find(k => Array.isArray(j[k]));
  if (arrKey) {
    const arr = j[arrKey];
    console.log(arrKey + ':', arr.length, 'elementi');
    console.log('primo:', JSON.stringify(arr[0]).slice(0, 500));
  }

  // 3. prova regioni EU
  for (const [region, lang] of [['FR', 'fr'], ['ES', 'es'], ['NL', 'nl']]) {
    const q2 = new URLSearchParams({
      region, language: lang,
      startTime: fmt(new Date(now.getTime() - 3600 * 1000)),
      endTime: fmt(new Date(now.getTime() + 3600 * 1000))
    });
    try {
      const r2 = await fetch('https://api.lgchannels.com/api/v1.0/schedulelist?' + q2.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/116 Safari/537.36',
          'X-Device-Country': region,
          'X-Device-Language': lang,
          'X-Authentication': 'lg-tv-services-key'
        },
        signal: AbortSignal.timeout(25000)
      });
      console.log(region + ':', r2.status, r2.ok ? 'OK!' : '');
    } catch (e) { console.log(region + ': ERR', e.message); }
  }
})();
