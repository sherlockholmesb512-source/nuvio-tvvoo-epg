(async () => {
  const B = 'http://localhost:7000';

  const man = await (await fetch(B + '/manifest.json')).json();
  console.log('cataloghi:', man.catalogs.map(c => c.name).join(' | '));
  console.log('idPrefixes:', man.idPrefixes.join(', '));

  const cat = await (await fetch(B + '/catalog/tv/sport_ora/genre.json')).json();
  console.log('\n=== SPORT • ORA IN TV (' + cat.metas.length + ' eventi/canali) ===');
  cat.metas.slice(0, 8).forEach(m => {
    console.log(' *', m.name.slice(0, 50), '|', m.releaseInfo || '', '|', (m.description || '').split('\n')[1] || '');
  });

  // cerca un canale Sky Sport noto e testa lo stream
  const target = cat.metas.find(m => /Sky Sport (Uno|Calcio|Arena)/i.test(m.description || ''));
  if (!target) { console.log('\nnessun canale Sky Sport trovato'); return; }
  console.log('\n=== STREAM per:', target.name.slice(0, 40), '===');
  const st = await (await fetch(B + '/stream/tv/' + encodeURIComponent(target.id) + '.json')).json();
  if (!st.streams || !st.streams.length) { console.log('NESSUNO STREAM (match canale fallito?)'); return; }
  st.streams.slice(0, 4).forEach(s => {
    console.log(' ', s.name, '|', s.title ? s.title.slice(0, 35) : '');
    console.log('   url ok?', /^https?:\/\//.test(s.url || ''), '| headers?', !!((s.behaviorHints && s.behaviorHints.proxyHeaders) || s.headers));
  });
})().catch(e => console.log('ERR', e.message));
