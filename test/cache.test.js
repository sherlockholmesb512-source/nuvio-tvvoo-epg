'use strict';

const BASE = 'http://localhost:7000';
const IDS = {
  'RAI 1': 'tvvooguide%3AUkFJIDE',
  'CANALE 5': 'tvvooguide%3AQ0FOQUxFIDU'
};

(async () => {
  for (const [name, id] of Object.entries(IDS)) {
    for (let i = 1; i <= 2; i++) {
      const r = await fetch(`${BASE}/stream/tv/${id}.json`);
      const j = await r.json();
      const s = j.streams && j.streams[0];
      const urlOk = !!(s && s.url);
      const req = s && s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request;
      console.log(`${name} chiamata ${i}: url=${urlOk ? 'OK' : 'MANCANTE'} | proxyHeaders.request=${req ? 'OK' : 'NO'} | headers-top=${!!(s && s.headers)} | bh-headers=${!!(s && s.behaviorHints && s.behaviorHints.headers)}`);
    }
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
