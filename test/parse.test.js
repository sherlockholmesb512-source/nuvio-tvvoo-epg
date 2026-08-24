'use strict';

const guidatv = require('../lib/guidatv');
const m3u = require('../lib/m3u');
const { canonicalKey } = require('../lib/util');

(async () => {
  const cat = await guidatv.getCategory(process.argv[2] || 'sky_sport');
  console.log('== CATEGORY:', cat.displayName, '| channels:', cat.channels.length);
  for (const ch of cat.channels.slice(0, 8)) {
    console.log(`- ${ch.guidatvName} [${ch.number}] key=${canonicalKey(ch.guidatvName)}`);
    if (ch.current) {
      console.log(`    NOW : ${ch.current.title} (${ch.current.start} -> ${ch.current.end})`);
      console.log(`    NEXT: ${ch.next ? ch.next.title : '-'}${ch.next && ch.next.start ? ' @ ' + ch.next.start : ''}`);
    }
  }

  const data = await m3u.getItalyM3U();
  console.log('\n== M3U channels:', data.entries.length, '| groups:', data.groups.join(', '));

  const guideKeys = cat.channels.map(c => canonicalKey(c.guidatvName));
  let matched = 0;
  for (const gk of guideKeys) {
    if (data.byKey.has(gk)) matched++;
  }
  console.log(`Matched guidatv keys in M3U (exact): ${matched}/${guideKeys.length}`);

  const dvb = await guidatv.getCategory('dvb');
  console.log('\n== DVB channels:', dvb.channels.length);
  for (const ch of dvb.channels.slice(0, 6)) {
    console.log(`- ${ch.guidatvName} | now: ${ch.current ? ch.current.title : '-'}`);
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
