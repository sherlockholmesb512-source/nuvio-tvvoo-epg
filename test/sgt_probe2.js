const fs = require('fs');
const html = fs.readFileSync(process.env.TEMP + '\\sgt_sport.html', 'utf8');

// 1. JSON embedded?
console.log('ha __NEXT_DATA__?', html.includes('__NEXT_DATA__'));
console.log('ha window.__', /window\.__[A-Z_]+/.test(html));
const jsons = [...new Set((html.match(/application\/ld\+json/gi) || []))];
console.log('ld+json:', jsons.length);

// 2. occorrenze nomi canale
for (const name of ['Sky Sport Uno', 'Sky Sport Calcio', 'Sky Sport Arena', 'Sky Sport Tennis', 'Sky Sport MotoGP', 'Sky Sport F1', 'Sky Sport Max', 'Sky Sport NBA', 'Sky Sport 251', 'Sky Sport Football']) {
  const n = (html.split(name).length - 1);
  if (n) console.log(`${name}: ${n}x`);
}

// 3. orari "HH:MM"
const times = [...new Set(html.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || [])];
console.log('\norari trovati:', times.slice(0, 20).join(' '));

// 4. estrai un blocco attorno a "Sky Sport Uno"
const i = html.indexOf('Sky Sport Uno');
if (i >= 0) {
  console.log('\n=== CONTESTO Sky Sport Uno ===');
  console.log(html.slice(Math.max(0, i - 1500), i + 500).replace(/\s+/g, ' ').slice(0, 2000));
}
