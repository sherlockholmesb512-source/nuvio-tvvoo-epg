const fs = require('fs');

(async () => {
  const t = fs.readFileSync(process.env.TEMP + '\\freetv.m3u', 'utf8');
  const urls = [...new Set(t.match(/https?:\/\/[^\s]*service-stitcher[^\s]*/g) || [])];
  const roku = urls.find(u => u.includes('rokuChannel'));
  console.log('=== URL ROKU COMPLETO ===');
  console.log(roku);
  console.log('\n=== parametri ===');
  const q = new URL('http://x' + roku.slice(roku.indexOf('/master') + '/master.m3u8'.length));
  // ricostruisci con nuovo ID canale IT
  const IT_ID = '608aa17fb9f4490007e6419a';
  const newUrl = `https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/${IT_ID}/master.m3u8${q.search}`;
  console.log('\n=== TEST su canale IT ===');
  const r = await fetch(newUrl, { signal: AbortSignal.timeout(15000) });
  console.log('status:', r.status);
  if (!r.ok) { console.log((await r.text()).slice(0, 200)); return; }
  const txt = await r.text();
  console.log('varianti:', (txt.match(/EXT-X-STREAM-INF/g) || []).length);
  console.log(txt.split('\n').slice(0, 6).join('\n').slice(0, 400));

  // fetch della prima variante per vedere i segmenti
  const variantLine = txt.split('\n').find(l => l && !l.startsWith('#'));
  if (variantLine) {
    const vUrl = new URL(variantLine.trim(), newUrl).href;
    const rv = await fetch(vUrl, { signal: AbortSignal.timeout(15000) });
    const tv = await rv.text();
    const segs = tv.split('\n').filter(l => l && !l.startsWith('#'));
    console.log('\nvariante:', rv.status, '| segmenti:', segs.length);
    console.log('domini segmenti:', [...new Set(segs.map(s => { try { return new URL(s).host } catch(e){ return '(rel)' } }))].slice(0,5).join(', '));
  }
})();
