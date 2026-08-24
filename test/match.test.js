'use strict';

const guidatv = require('../lib/guidatv');
const m3u = require('../lib/m3u');
const { canonicalKey, tokenSet, jaccard } = require('../lib/util');

(async () => {
  const data = await m3u.getItalyM3U();
  const piats = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(guidatv.PIAT_DISPLAY);

  for (const piat of piats) {
    const cat = await guidatv.getCategory(piat);
    console.log(`\n===== ${cat.displayName} (${cat.channels.length}) =====`);
    let exact = 0;
    for (const ch of cat.channels) {
      const key = canonicalKey(ch.guidatvName);
      if (data.byKey.has(key)) { exact++; continue; }
      const tokens = tokenSet(ch.guidatvName);
      let best = null, bestScore = 0;
      for (const [k] of data.byKey.entries()) {
        const s = jaccard(tokens, k.match(/[a-z0-9]+/g) || []);
        if (s > bestScore) { bestScore = s; best = k; }
      }
      const status = bestScore >= 0.6 ? `FUZZY(${bestScore.toFixed(2)})->${best}` : (best ? `MISS(${bestScore.toFixed(2)}) nearest=${best}` : 'EMPTY');
      console.log(`  ${ch.guidatvName}  key=${key}  => ${status}`);
    }
    console.log(`exact=${exact}/${cat.channels.length}`);
  }
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
