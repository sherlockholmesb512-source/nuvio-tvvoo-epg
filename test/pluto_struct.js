(async () => {
  const r = await fetch('https://api.pluto.tv/v2/channels.json', { signal: AbortSignal.timeout(20000) });
  const all = await r.json();

  // analisi categorie e flag
  const cats = {};
  let directOnly = 0, visOther = 0;
  for (const c of all) {
    cats[c.category] = (cats[c.category] || 0) + 1;
    if (c.directOnly) directOnly++;
    if (c.visibility !== 'everyone') visOther++;
  }
  console.log('categorie:', JSON.stringify(cats));
  console.log('directOnly:', directOnly, '| visibility != everyone:', visOther);

  const ok = all.filter(c => c.visibility === 'everyone' && !c.directOnly);
  console.log('\ncanali filtrati:', ok.length);
  const sample = ok.slice(0, 12).map(c => `${c.name} [${c.category}] n${c.number}`);
  console.log(sample.join('\n'));

  // test EPG timelines
  const ids = ok.slice(0, 3).map(c => c._id).join(',');
  const now = new Date(); const stop = new Date(Date.now() + 4 * 3600e3);
  const tq = new URLSearchParams({
    channelIds: ids, side: 'now', startTime: now.toISOString(), stopTime: stop.toISOString(),
    appVersion: 'unknown', deviceId: 'unknown', deviceModel: 'web', deviceMake: 'web',
    deviceType: 'web', deviceVersion: 'unknown', deviceDNT: '0', sid: 'test'
  });
  const tr = await fetch('https://service-media-search.clusters.pluto.tv/stitch/timelines/segments?' + tq, { signal: AbortSignal.timeout(20000) });
  console.log('\ntimelines:', tr.status);
  if (tr.ok) {
    const tj = await tr.json();
    console.log('risposta:', JSON.stringify(tj).slice(0, 900));
  }
})();
