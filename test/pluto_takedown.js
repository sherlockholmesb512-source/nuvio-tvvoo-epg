const fs = require('fs');
const fast = require('../lib/fast');

const ID = '608aa17fb9f4490007e6419a'; // Pluto TV Film

async function primoSeg(masterUrl, tag) {
  try {
    const r = await fetch(masterUrl, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) { console.log(tag, '| master ERR', r.status); return; }
    const txt = await r.text();
    const varLine = txt.split('\n').filter(l => l && !l.startsWith('#')).pop();
    if (!varLine) { console.log(tag, '| niente varianti'); return; }
    const vUrl = new URL(varLine.trim(), masterUrl).href;
    const vt = await (await fetch(vUrl, { signal: AbortSignal.timeout(25000) })).text();
    const seg = vt.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))[0] || '';
    console.log(tag, '->', seg ? decodeURIComponent(seg).slice(-75) : '?');
  } catch (e) { console.log(tag, '| ERR', e.message); }
}

(async () => {
  // A) boot WEB session vero
  const q = new URLSearchParams({
    appName: 'web', appVersion: '9.0.0', deviceVersion: '120.0', deviceModel: 'web',
    deviceMake: 'chrome', deviceType: 'web', clientVersion: '9.0.0',
    clientID: '5c1b19eb-6c7b-4a1b-b2cc-7aa2cb70e863', clientModelNumber: '1.0'
  }).toString();
  const boot = await (await fetch(`https://boot.pluto.tv/v4/start?${q}`)).json();
  console.log('boot country:', boot.country, '| ha stitcherParams:', !!boot.stitcherParams);
  if (boot.stitcherParams) {
    await primoSeg(`https://service-stitcher.clusters.pluto.tv/stitch/hls/channel/${ID}/master.m3u8?${boot.stitcherParams}`, 'A) boot-web');
  }

  // B) pattern Free-TV esatto (estratto dal loro m3u)
  const ft = fs.readFileSync(process.env.TEMP + '\\freetv.m3u', 'utf8');
  const urls = [...new Set(ft.match(/https?:\/\/[^\s]*stitch\/hls[^\s]*/g) || [])];
  if (urls.length) {
    const tpl = urls[0];
    const u = new URL(tpl);
    const newPath = u.pathname.replace(/channel\/[a-f0-9]+/, `channel/${ID}`);
    const freeTvUrl = `${u.protocol}//${u.host}${newPath}${u.search}`;
    console.log('\npattern freetv:', freeTvUrl.slice(8, 110));
    await primoSeg(freeTvUrl.replace(/^http:/, 'https:'), 'B) freetv-DNT');
  }

  // C) playlist i.mjh.nz per region IT?
  const tree = JSON.parse(fs.readFileSync(process.env.TEMP + '\\imjh_tree.json', 'utf8'));
  const plutoPaths = tree.filter(p => /pluto/i.test(p)).slice(0, 20);
  console.log('\npath pluto su i.mjh.nz:', JSON.stringify(plutoPaths));
})();
