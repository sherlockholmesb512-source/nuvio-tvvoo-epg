(async () => {
  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
    'Origin': 'https://rakuten.tv',
    'Referer': 'https://rakuten.tv/'
  };
  const base = 'https://gizmo.rakuten.tv/v3/live_channels?classification_id=36&device_identifier=web&locale=it&market_code=it&per_page=20';

  // scarica tutte le pagine
  let all = [];
  for (let p = 1; p <= 7; p++) {
    const r = await fetch(base + '&page=' + p, { headers: H, signal: AbortSignal.timeout(20000) });
    if (!r.ok) break;
    const j = await r.json();
    all = all.concat(j.data || []);
    if (!j.meta || j.meta.pagination.page >= j.meta.pagination.total_pages) break;
  }
  console.log('canali totali:', all.length);

  // categorie -> mappa channel_id -> cat
  const rc = await fetch('https://gizmo.rakuten.tv/v3/live_channel_categories?classification_id=36&device_identifier=web&locale=it&market_code=it', { headers: H, signal: AbortSignal.timeout(20000) });
  const jc = await rc.json();
  const catMap = {};
  (jc.data || []).forEach(cat => (cat.live_channels || []).forEach(id => { catMap[id] = cat.name; }));
  console.log('mappati in categorie:', Object.keys(catMap).length);

  // stampa tutti i canali con categoria
  const { canonicalKey } = require('../lib/util');
  const uniData = await (async () => {
    try {
      const catalogs = require('../lib/catalogs');
      return await catalogs.buildUniverse();
    } catch (e) { return null; }
  })();
  const uniKeys = new Set(uniData ? uniData.channels.map(c => c.key) : []);

  let matched = 0;
  all.forEach(c => {
    const key = canonicalKey(c.title);
    const hit = uniKeys.has(key);
    if (hit) matched++;
    console.log(` * ${c.title} | ${catMap[c.id] || '?'} | ${c.channel_number} | guidatv:${hit ? 'SI' : '-'}`);
  });
  console.log('\nmatch guidatv:', matched, '/', all.length);

  // prova endpoint epg alternativi su un canale
  const c0 = all[0];
  const tries = [
    `https://gizmo.rakuten.tv/v3/live_channels/${c0.id}/epg?classification_id=36&device_identifier=web&locale=it&market_code=it`,
    `https://gizmo.rakuten.tv/v3/epg?classification_id=36&device_identifier=web&locale=it&market_code=it&content_id=${c0.id}`
  ];
  for (const u of tries) {
    try {
      const r2 = await fetch(u, { headers: H, signal: AbortSignal.timeout(15000) });
      const t = await r2.text();
      console.log('EPG try', u.split('/v3/')[1].slice(0, 40), '->', r2.status, t.slice(0, 120));
    } catch (e) { console.log('EPG try ERR', e.message); }
  }

  require('fs').writeFileSync(process.env.TEMP + '\\rak_all.json', JSON.stringify(all.map(c => ({
    id: c.id, name: c.title, num: c.channel_number,
    cat: catMap[c.id] || null,
    logo: (c.images && (c.images.artwork || c.images.thumbnail)) || null
  }))));
})().catch(e => console.log('ERR', e.message));
