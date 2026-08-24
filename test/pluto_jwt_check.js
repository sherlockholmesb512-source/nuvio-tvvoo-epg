const fast = require('../lib/fast');

(async () => {
  const pluto = await fast.loadPluto();
  const ch = pluto.find(c => c.name === 'Pluto TV Film') || pluto[0];
  console.log('canale:', ch.id, ch.name);
  const url = await fast.plutoStreamUrl(ch.id);
  console.log('URL completo:\n', url.slice(0, 400));
  console.log('\nha jwt?', /jwt=/.test(url));
  // verifica fetch
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  console.log('fetch status:', r.status);
})().catch(e => console.log('ERR', e.message));
