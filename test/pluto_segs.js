const fast = require('../lib/fast');

(async () => {
  // 1. duplicati per nome nell'API
  const r = await fetch('https://api.pluto.tv/v2/channels.json', { signal: AbortSignal.timeout(20000) });
  const list = await r.json();
  const byName = {};
  for (const c of list) {
    (byName[c.name] = byName[c.name] || []).push({ id: c._id.slice(-6), cat: c.category, slug: c.slug });
  }
  console.log('=== NOMI DUPLICATI ===');
  Object.entries(byName).filter(([, v]) => v.length > 1).forEach(([n, v]) =>
    console.log(n, JSON.stringify(v)));

  // 2. dimensioni segmenti reali del canale Film (vecchio id che funziona in lista)
  const pluto = await fast.loadPluto();
  const ch = pluto.find(c => c.name === 'Pluto TV Film');
  console.log('\ncanale scelto:', ch.id);
  const url = await fast.plutoStreamUrl(ch.id);
  const m = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).text();
  // prendi la variante video con BANDWIDTH piu alta
  const lines = m.split('\n');
  let bestBw = 0, bestUri = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const bw = parseInt((/BANDWIDTH=(\d+)/.exec(lines[i]) || [])[1] || '0');
      const uri = (lines[i + 1] || '').trim();
      if (bw > bestBw && uri && !uri.includes('subtitle')) { bestBw = bw; bestUri = uri; }
    }
  }
  console.log('variante top bandwidth:', bestBw);
  const vUrl = new URL(bestUri, url).href;
  const vt = await (await fetch(vUrl, { signal: AbortSignal.timeout(20000) })).text();
  const segs = vt.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).slice(0, 4);
  console.log('segmenti da scaricare:', segs.length);
  for (let i = 0; i < Math.min(3, segs.length); i++) {
    const sUrl = new URL(segs[i], vUrl).href;
    try {
      const rs = await fetch(sUrl, { signal: AbortSignal.timeout(25000) });
      const buf = Buffer.from(await rs.arrayBuffer());
      console.log(`seg ${i}: ${rs.status} ${Math.round(buf.length / 1024)} KB`);
    } catch (e) { console.log(`seg ${i}: ERR ${e.message}`); }
  }
})();
