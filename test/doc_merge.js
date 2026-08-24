(async () => {
  const j = await (await fetch('http://localhost:7000/catalog/tv/tvvoo_it_epg/genre.json?genre=' + encodeURIComponent('Sky Documentari'))).json();
  console.log('totale in Sky Documentari:', j.metas.length);
  j.metas.forEach(m => console.log(' *', m.name, '|', m.id.slice(0, 22)));
})().catch(e => console.log('ERR', e.message));
