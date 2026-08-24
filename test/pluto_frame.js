const { execSync } = require('child_process');
const fs = require('fs');
const fast = require('../lib/fast');

(async () => {
  const ff = fs.readFileSync(process.env.TEMP + '\\ffmpeg_path.txt', 'utf8').trim();
  const ch = (await fast.loadPluto()).find(c => c.name === 'Pluto TV Film');
  const up = await fast.plutoStreamUrl(ch.id);

  // 1. fotogramma dallo stream UPSTREAM diretto
  console.log('estraggo frame upstream...');
  try {
    execSync(`"${ff}" -y -hide_banner -loglevel error -user_agent "Mozilla/5.0" -i "${up}" -t 8 -frames:v 1 "${process.env.TEMP}\\frame_up.png"`, { timeout: 90000 });
    console.log('OK frame_up.png');
  } catch (e) { console.log('ffmpeg upstream ERR:', String(e.stderr).slice(0, 300)); }

  // 2. fotgramma tramite PROXY locale
  const prox = `http://localhost:7000/pp/${Buffer.from(up).toString('base64url')}`;
  console.log('estraggo frame proxy...');
  try {
    execSync(`"${ff}" -y -hide_banner -loglevel error -i "${prox}" -t 12 -frames:v 1 "${process.env.TEMP}\\frame_proxy.png"`, { timeout: 120000 });
    console.log('OK frame_proxy.png');
  } catch (e) { console.log('ffmpeg proxy ERR:', String(e.stderr).slice(0, 300)); }

  for (const f of ['frame_up.png', 'frame_proxy.png']) {
    const p = process.env.TEMP + '\\' + f;
    if (fs.existsSync(p)) console.log(f, Math.round(fs.statSync(p).size / 1024) + ' KB ->', p);
  }
})();
