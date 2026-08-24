const B = 'http://localhost:7000';
(async () => {
  const man = await (await fetch(B + '/manifest.json')).json();
  console.log('cataloghi:', man.catalogs.map(c => c.id).join(', '));
  console.log('idPrefixes:', man.idPrefixes.join(', '));
  const pc = man.catalogs.find(c => c.id === 'plutotv_it');
  console.log('\nPluto nel manifest:', !!pc, '| generi:', pc ? pc.extra[0].options.length : '-');

  const cat = await (await fetch(B + '/catalog/tv/plutotv_it/genre.json?genre=' + encodeURIComponent('Film'))).json();
  console.log('canali Film:', cat.metas.length, '| primo:', cat.metas[0].name);

  const film = cat.metas.find(m => m.name === 'Pluto TV Film') || cat.metas[0];
  const sid = `nuvio-pluto:${film.id.split(':').pop()}`;
  const sj = await (await fetch(`${B}/stream/tv/${encodeURIComponent(sid)}.json`)).json();
  const s = sj.streams[0];
  console.log('\nstream:', s.name);
  console.log('url:', s.url.slice(0, 90) + '...');

  // master attraverso il proxy
  const mr = await fetch(s.url);
  const mt = await mr.text();
  console.log('\nmaster via /pp/:', mr.status, '| varianti:', (mt.match(/EXT-X-STREAM-INF/g) || []).length);
  const varUrl = mt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).pop();

  // variante -> segmenti
  const vr = await fetch(varUrl);
  const vt = await vr.text();
  const segs = vt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const proxSeg = segs[0];
  const dec = Buffer.from(proxSeg.split('/pp/')[1], 'base64url').toString();
  console.log('variante:', vr.status, '| segmenti media:', segs.length);
  console.log('segmento upstream:', decodeURIComponent(dec).slice(-80));

  // scarica un segmento via proxy per conferma bytes
  const sr = await fetch(proxSeg, { method: 'GET' });
  const buf = Buffer.from(await sr.arrayBuffer());
  console.log('\ndownload segmento via proxy:', sr.status, '|', (buf.length / 1024).toFixed(0) + ' KB');
  console.log('\n>>> ESITO FINALE:', /takedown/i.test(dec) ? '❌ SLATE' : '✅ CONTENUTO VERO ATTRAVERSO IL PROXY');
})();
