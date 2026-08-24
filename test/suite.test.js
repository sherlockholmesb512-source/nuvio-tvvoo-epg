'use strict';

const BASE = 'http://localhost:7000';
let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra || ''); }
}

async function jget(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json() };
}

(async () => {
  console.log('== manifest ==');
  const m = await jget('/manifest.json');
  ok('status 200', m.status === 200);
  ok('id', m.body.id === 'community.tvvooguide.nuvio');
  ok('types tv', m.body.types.includes('tv'));
  ok('resources', ['catalog','meta','stream'].every(r => m.body.resources.includes(r)));
  ok('9 genres', m.body.catalogs[0].extra[0].options.length === 9);

  console.log('== catalog: Tutti ==');
  const t = await jget('/catalog/tv/tvvoo_it_epg/genre.json?genre=Tutti');
  ok('metas > 100', t.body.metas.length > 100, `got ${t.body.metas.length}`);
  const withEpg = t.body.metas.filter(x => /IN ONDA ORA|PROSSIMAMENTE/.test(x.description || '')).length;
  ok(`EPG on guidatv channels (${withEpg}/~150)`, withEpg >= 120, `got ${withEpg}`);
  ok('posters present', t.body.metas.every(x => x.poster));

  for (const genre of ['Sky Intrattenimento','Sky Sport','Sky Cinema','Sky Documentari','Sky News','Sky Bambini','Sky Musica']) {
    const c = await jget('/catalog/tv/tvvoo_it_epg/genre.json?genre=' + encodeURIComponent(genre));
    ok(`${genre}: ${c.body.metas.length} metas`, c.body.metas.length > 3);
    const e = c.body.metas.filter(x => /IN ONDA ORA|PROSSIMAMENTE/.test(x.description || '')).length;
    ok(`${genre}: epg ${e}/${c.body.metas.length}`, e >= c.body.metas.length - (genre === 'Sky Documentari' ? 6 : 2));
  }

  console.log('== meta detail ==');
  const first = t.body.metas.find(x => /IN ONDA ORA/.test(x.description || ''));
  const md = await jget('/meta/tv/' + encodeURIComponent(first.id) + '.json');
  ok('meta status 200', md.status === 200);
  ok('has PROSSIMI PROGRAMMI', /PROSSIMI PROGRAMMI/.test(md.body.meta.description || ''));
  ok('name matches', md.body.meta.name === first.name);

  console.log('== streams ==');
  const candidates = t.body.metas.filter(x => /RAI 1|CANALE 5|SKY SPORT|IRIS|CIELO|NOVE/i.test(x.name)).slice(0, 6);
  for (const c of candidates) {
    const s = await jget('/stream/tv/' + encodeURIComponent(c.id) + '.json');
    const st = s.body.streams && s.body.streams[0];
    ok(`${c.name}: stream ${st ? 'OK' : 'none'}`, !!st, st ? st.url.slice(0, 50) : '');
    if (st) {
      const reqH = st.behaviorHints && st.behaviorHints.proxyHeaders && st.behaviorHints.proxyHeaders.request;
      ok(`${c.name}: has request headers`, !!(reqH && reqH['User-Agent'] && reqH['Referer']));
      ok(`${c.name}: notWebReady`, st.behaviorHints && st.behaviorHints.notWebReady === true);
    }
  }

  console.log('== search ==');
  const se = await jget('/catalog/tv/tvvoo_it_search/search.json?search=rai');
  ok('search results', se.body.metas.length > 0);

  console.log('== configure page ==');
  const page = await fetch(BASE + '/configure');
  const html = await page.text();
  ok('html 200', page.status === 200);
  ok('contains manifest url', html.includes('/manifest.json'));

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERR:', e); process.exit(1); });
