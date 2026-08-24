'use strict';
const vavoo = require('../lib/vavoo');
const { fetchWithTimeout } = require('../lib/util');

(async () => {
  const sig = await vavoo.getSignature(null);
  const headers = {
    'user-agent': 'okhttp/4.11.0',
    'accept': 'application/json',
    'content-type': 'application/json; charset=utf-8',
    'accept-encoding': 'gzip',
    'mediahubmx-signature': sig
  };
  const mkBody = (search) => JSON.stringify({
    language: 'it', region: 'IT', catalogId: 'iptv', id: 'iptv', adult: false,
    search, sort: 'name', filter: { group: 'Italy' }, clientVersion: '3.1.0'
  });
  for (const q of ['sky news', 'news', 'sport uno', 'boomerang']) {
    const r = await fetchWithTimeout('https://vavoo.to/mediahubmx-catalog.json', {
      method: 'POST', headers, body: mkBody(q)
    }, 15000);
    const j = await r.json();
    console.log('search="' + q + '" ->', (j.items || []).length, 'items');
    (j.items || []).slice(0, 6).forEach(it => console.log('   -', it.name));
  }
})().catch(e => { console.log('ERR:', e.message); process.exit(1); });
