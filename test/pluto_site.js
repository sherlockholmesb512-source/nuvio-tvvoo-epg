const fs = require('fs');

(async () => {
  const tree = JSON.parse(fs.readFileSync(process.env.TEMP + '\\imjh_tree.json', 'utf8'));
  const paths = (tree.tree || []).map(x => x.path);
  console.log('file totali:', paths.length);

  // tutti i file m3u sotto PlutoTV
  const m3us = paths.filter(p => /plutotv/i.test(p) && /m3u/i.test(p));
  console.log('\nM3U PlutoTV:');
  m3us.forEach(p => console.log(' ', p));

  // prova a scaricare la playlist IT se esiste
  const itCandidates = ['PlutoTV/it.m3u8', 'PlutoTV/pluto-it.m3u8', 'PlutoTV/it.playlist.m3u8'];
  for (const cand of [...m3us.filter(p => /\bit\b|italy/i.test(p)), ...itCandidates]) {
    const url = `https://raw.githubusercontent.com/matthuisman/i.mjh.nz/master/${cand}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    console.log('\ntry', cand, '->', r.status);
    if (r.ok) {
      const txt = await r.text();
      console.log(txt.split('\n').slice(0, 6).join('\n'));
      fs.writeFileSync(process.env.TEMP + '\\pluto_it_m3u.txt', txt);
      console.log('salvato! righe:', txt.split('\n').length);
      break;
    }
  }
})();
