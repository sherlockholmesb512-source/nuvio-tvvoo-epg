const zlib = require('zlib');
const fs = require('fs');

(async () => {
  const sc = JSON.parse(zlib.gunzipSync(fs.readFileSync(process.env.TEMP + '\\sams_channels.json.gz')).toString());
  const itChans = sc.regions.it.channels;
  console.log('=== Samsung IT: cerco Man-ga/anime ===');
  Object.entries(itChans).filter(([, c]) => /man.?ga|anime|manga/i.test(c.name)).forEach(([k, c]) => {
    console.log(' ', k.slice(0, 14), '|', c.name, '| gruppo:', c.group);
  });
  console.log('gruppi samsung IT:', [...new Set(Object.values(itChans).map(c => c.group))].join(', ').slice(0, 400));

  console.log('\n=== test jmp2.uk redirect ===');
  const testIds = ['IT500008CB', 'ITBA33000374G'];
  for (const id of testIds) {
    try {
      const r = await fetch('https://jmp2.uk/stvp-' + id, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const loc = r.headers.get('location');
      console.log(id, '->', r.status, loc ? loc.slice(0, 120) : '(no location)');
      if (loc && !loc.includes('.m3u8')) {
        const r2 = await fetch(loc, { signal: AbortSignal.timeout(15000) });
        const t = await r2.text();
        console.log('  target:', r2.status, '|', t.slice(0, 80).replace(/\n/g, ' '));
      }
    } catch (e) {
      console.log(id, 'ERR:', e.message);
    }
  }
})();
