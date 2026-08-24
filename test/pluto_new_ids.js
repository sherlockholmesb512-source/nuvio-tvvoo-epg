const fast = require('../lib/fast');

(async () => {
  const pluto = await fast.loadPluto();
  console.log('canali:', pluto.length);
  const film = pluto.find(c => c.name === 'Pluto TV Film');
  const plus = pluto.find(c => c.name === 'Pluto TV Film+');
  console.log('\nFilm:', film.id, '| gruppo:', film.group, '| epg programs:', film.programs.length);
  console.log('Film+:', plus ? plus.id : 'MANCANTE', '| gruppo:', plus && plus.group);

  // stream col NUOVO id
  const url = await fast.plutoStreamUrl(film.id);
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  console.log('\nstream nuovo ID:', r.status);
  if (r.ok) {
    const txt = await r.text();
    console.log('varianti:', (txt.match(/EXT-X-STREAM-INF/g) || []).length);
  }
  if (plus) {
    const r2 = await fetch(await fast.plutoStreamUrl(plus.id), { signal: AbortSignal.timeout(20000) });
    console.log('stream Film+:', r2.status);
  }

  // generi
  const groups = [...new Set(pluto.map(c => c.group))];
  console.log('\ngeneri (' + groups.length + '):', groups.join(', '));
})().catch(e => console.log('ERR', e.message));
