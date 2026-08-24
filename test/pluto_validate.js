const fast = require('../lib/fast');

async function isAlive(id) {
  try {
    const master = await fast.plutoStreamUrl(id);
    const r = await fetch(master, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { alive: false, why: 'master ' + r.status };
    const txt = await r.text();
    const varLine = txt.split('\n').filter(l => l && !l.startsWith('#')).pop();
    if (!varLine) return { alive: false, why: 'no variants' };
    const vUrl = new URL(varLine.trim(), master).href;
    const vt = await (await fetch(vUrl, { signal: AbortSignal.timeout(12000) })).text();
    const seg = vt.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))[0] || '';
    if (/takedown/i.test(seg)) return { alive: false, why: 'takedown' };
    return { alive: true, why: '' };
  } catch (e) {
    return { alive: false, why: e.message.slice(0, 40) };
  }
}

(async () => {
  const chs = await fast.loadPluto();
  console.log('canali da validare:', chs.length);
  const results = {};
  const CONC = 12;
  let done = 0;
  const queue = [...chs];
  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      const v = await isAlive(c.id);
      results[c.id] = v.alive;
      done++;
      if (!v.alive || done % 20 === 0) process.stdout.write(`[${done}/${chs.length}] ${c.name}: ${v.alive ? 'OK' : 'X ' + v.why}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  const alive = Object.values(results).filter(Boolean).length;
  console.log(`\n=== RISULTATO: ${alive} vivi / ${chs.length - alive} morti ===`);
  require('fs').writeFileSync(process.env.TEMP + '\\pluto_alive.json', JSON.stringify(results, null, 0));
  // lista dei morti
  const dead = chs.filter(c => !results[c.id]);
  console.log('morti:', dead.map(c => c.name).join(' | ').slice(0, 800));
})();
