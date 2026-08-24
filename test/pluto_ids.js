const fs = require('fs');

(async () => {
  const r = await fetch('https://api.pluto.tv/v2/channels.json', { signal: AbortSignal.timeout(20000) });
  const all = await r.json();
  console.log('canali API:', all.length);
  // struttura regions di un esempio
  const ex = all[0];
  console.log('esempio regions:', JSON.stringify(ex.regions || null).slice(0, 120));

  const fast = require('../lib/fast');
  const ours = await fast.loadPluto();
  const oursByName = new Map(ours.map(c => [c.name.toLowerCase(), c.id]));

  let match = 0; const differente = []; const apiOnly = [];
  for (const c of all) {
    const nome = (c.name || '').trim();
    if (!nome) continue;
    const nostroId = oursByName.get(nome.toLowerCase());
    if (!nostroId) { apiOnly.push(nome); continue; }
    if (nostroId === c._id) match++;
    else differente.push(`${nome}: nostro=${nostroId.slice(-6)} api=${c._id.slice(-6)}`);
  }
  console.log('\nID identici:', match, '/', all.length);
  console.log('ID DIVERSI:', differente.length);
  differente.slice(0, 10).forEach(d => console.log('  ', d));
  console.log('\ncanali SOLO API:', apiOnly.length);
  console.log(apiOnly.slice(0, 15).join(' | '));
})();
