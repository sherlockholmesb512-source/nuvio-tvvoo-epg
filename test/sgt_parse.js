const fs = require('fs');
const html = fs.readFileSync(process.env.TEMP + '\\sgt_sport.html', 'utf8');

const ANCHOR_RE = /href="\/programmazione-canale\/oggi\/guida-programmi-tv-([^"'\/]+)\/[a-z0-9-]+\/(\d+)\//g;
const PROG_RE = /sgtv-font-bold"[^>]*>([\d]{1,2}:[\d]{2})<\/p>\s*<div[^>]*>\s*<p[^>]*>([^<]+)<\/p>(?:\s*<p[^>]*>([^<]*)<\/p>)?/g;

const marks = [...html.matchAll(ANCHOR_RE)];
console.log('canali trovati:', marks.length);

for (let i = 0; i < Math.min(marks.length, 12); i++) {
  const start = marks[i].index;
  const end = i + 1 < marks.length ? marks[i + 1].index : start + 60000;
  const chunk = html.slice(start, Math.min(end, start + 80000));
  const slug = marks[i][1], sgtId = marks[i][2];
  const altM = chunk.match(/alt="([^"]+)"(?:[^>]*src="([^"]+)")?/);
  const name = altM ? altM[1] : slug;
  const logo = altM && altM[2] ? altM[2] : null;
  const chM = chunk.match(/Ch\.\s*(\d+)/);
  const progs = [];
  let m;
  PROG_RE.lastIndex = 0;
  while ((m = PROG_RE.exec(chunk)) && progs.length < 6) {
    progs.push({ t: m[1], title: m[2], cat: m[3] || '' });
  }
  console.log(`\n#${sgtId} ${name} (Ch.${chM ? chM[1] : '?'}) ${progs.length} prog`);
  progs.slice(0, 4).forEach(p => console.log('  ', p.t, '|', p.title.slice(0, 45), '|', p.cat));
}
