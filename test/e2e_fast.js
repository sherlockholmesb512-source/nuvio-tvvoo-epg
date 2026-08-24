const BASE = 'http://localhost:7000';

(async () => {
  const j = async p => (await fetch(BASE + p, { signal: AbortSignal.timeout(60000) })).json();

  console.log('=== MANIFEST ===');
  const m = await j('/manifest.json');
  m.catalogs.forEach(c => console.log(' -', c.id, '|', c.name));
  console.log('idPrefixes:', m.idPrefixes.join(', '));

  console.log('\n=== PLUTO catalogo (primi 5) ===');
  const pc = await j('/catalog/tv/plutotv_it/genre.json?genre=' + encodeURIComponent('Film'));
  console.log('genere Film:', pc.metas.length, 'canali');
  pc.metas.slice(0, 5).forEach(x => console.log(' *', x.name, '| Ch.' + (x.releaseInfo || '-'), '|', (x.description || '').split('\n')[0].slice(0, 45)));

  console.log('\n=== SAMSUNG catalogo ===');
  const sc = await j('/catalog/tv/samsungtvplus_it/genre.json?genre=' + encodeURIComponent('Anime'));
  sc.metas.slice(0, 4).forEach(x => console.log(' *', x.name, '|', (x.description || '').split('\n')[0].slice(0, 40)));

  console.log('\n=== EXTRA (RSI) ===');
  const ex = await j('/catalog/tv/extra_it/genre.json');
  for (const meta of ex.metas) {
    console.log(' *', meta.name, '|', (meta.description || '').split('\n')[0].slice(0, 50));
    const s = await j('/stream/tv/' + encodeURIComponent(meta.id) + '.json');
    s.streams.forEach(st => console.log('    stream:', st.url ? 'OK ' + st.url.slice(8, 30) : 'MANCANTE', '|', st.title.slice(0, 40)));
  }

  console.log('\n=== STREAM Pluto (primo canale Film) ===');
  const st1 = await j('/stream/tv/' + encodeURIComponent(pc.metas[0].id) + '.json');
  st1.streams.forEach(s => {
    console.log(' ', s.name, '|', s.title.slice(0, 40));
    console.log('  sessione boot?', /clientID=/.test(s.url) && /deviceDNT=/.test(s.url) ? 'SI' : 'NO');
  });

  console.log('\n=== RAKUTEN catalogo ===');
  const rk = await j('/catalog/tv/rakutentv_it/genre.json?genre=' + encodeURIComponent('Sport'));
  console.log('genere Sport:', rk.metas.length);
  rk.metas.slice(0, 5).forEach(x => console.log(' *', x.name, '| Ch.' + (x.releaseInfo || '-'), '|', (x.description || '').split('\n')[0].slice(0, 45)));
  if (rk.metas.length) {
    const rs = await j('/stream/tv/' + encodeURIComponent(rk.metas[0].id) + '.json');
    rs.streams.forEach(s => console.log('   stream:', s.url ? 'OK ' + s.url.slice(8, 55) : 'MANCANTE'));
  }
})();
