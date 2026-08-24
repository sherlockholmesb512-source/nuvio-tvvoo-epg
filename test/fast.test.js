const assert = require('assert');
const fast = require('../lib/fast');

(async () => {
  let pass = 0, fail = 0;
  const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

  const pluto = await fast.loadPluto();
  console.log('pluto canali:', pluto.length);
  ok('pluto >100', pluto.length > 100);
  ok('pluto campi', pluto[0].name && pluto[0].group && Array.isArray(pluto[0].programs));
  const withProg = pluto.filter(c => c.programs.length > 0).length;
  console.log('pluto con programs:', withProg);
  ok('pluto epg diffuso', withProg > pluto.length * 0.8);

  const samsung = await fast.loadSamsung();
  console.log('samsung canali:', samsung.length);
  ok('samsung >100', samsung.length > 100);

  const p0 = pluto.find(c => c.programs.length >= 2);
  const epg = fast.epgFromPrograms(p0.programs);
  ok('epg current', !!epg.current);
  ok('epg next', !!epg.next);
  console.log('epg sample:', p0.name, '|', epg.current.title.slice(0, 30), '| poi:', epg.next.title.slice(0, 30));

  const meta = await fast.fastToMeta(p0);
  ok('meta id prefix', meta.id.startsWith(fast.PLUTO_PREFIX + ':'));
  ok('meta poster', !!meta.poster);
  ok('meta descr epg', /IN ONDA ORA/.test(meta.description));

  const st = (await fast.fastStreams(p0))[0];
  ok('stream url pluto stitcher v2', /cfd-v4-service-channel-stitcher[^/]+\.pluto\.tv\/v2\/stitch/.test(st.url));
  ok('stream url jwt', /jwt=/.test(st.url) && /masterJWTPassthrough=true/.test(st.url));
  console.log('pluto stream url ok');

  const s0 = samsung[0];
  const ss = (await fast.fastStreams(s0))[0];
  ok('stream url samsung jmp2', ss.url.startsWith('https://jmp2.uk/stvp-'));
  console.log('samsung stream url:', ss.url);

  const metasAll = await fast.catalogMetas('samsung', null, null);
  const metasFilm = await fast.catalogMetas('samsung', 'Film', null);
  console.log('samsung tutte:', metasAll.length, '| genere Film:', metasFilm.length);
  ok('filtro genere samsung', metasFilm.length > 0 && metasFilm.length < metasAll.length);
  const searched = await fast.catalogMetas('pluto', null, 'news');
  ok('search pluto', searched.length > 0);

  const byId = await fast.metaById(meta.id);
  ok('metaById roundtrip', byId && byId.id === meta.id);
  const streamsById = await fast.streamsById(meta.id);
  ok('streamsById roundtrip', streamsById.length >= 1 && streamsById.every(s => !!s.url));

  const gPluto = await fast.genreOptions('pluto');
  console.log('generi pluto:', gPluto.length, '|', gPluto.slice(0, 6).join(', '));
  ok('generi pluto >10', gPluto.length > 10);

  console.log('\n--- RAKUTEN ---');
  const rakuten = await fast.loadRakuten();
  console.log('rakuten canali:', rakuten.length);
  ok('rakuten >100', rakuten.length > 100);
  ok('rakuten gruppi', rakuten.filter(c => c.group && c.group !== 'Altro').length > 50);
  ok('rakuten lingue', rakuten.some(c => c.languages && c.languages.length));

  const rCh = rakuten.find(c => /film/i.test(c.name)) || rakuten[0];
  const rMeta = await fast.fastToMeta(rCh);
  ok('rakuten meta id', rMeta.id.startsWith(fast.RAKUTEN_PREFIX + ':'));
  console.log('rakuten meta:', rCh.name, '| gruppo:', rCh.group, '| epg guidatv:', /IN ONDA ORA/.test(rMeta.description) ? 'SI' : 'no');

  const rStream = (await fast.streamsById(rMeta.id))[0];
  ok('rakuten stream url', !!rStream && /^https?:\/\//.test(rStream.url));
  console.log('rakuten stream:', rStream ? rStream.url.slice(8, 60) : 'NO');

  const gRak = await fast.genreOptions('rakuten');
  console.log('generi rakuten:', gRak.join(', '));
  ok('generi rakuten >5', gRak.length > 5);

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
