const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
  'Accept': 'application/json'
};

(async () => {
  const tries = [
    'https://api.superguidatv.it/v1/channels',
    'https://api.superguidatv.it/v1/channels/37',
    'https://api.superguidatv.it/v1/channels/37/programs',
    'https://api.superguidatv.it/v1/channels/37/broadcasts',
    'https://api.superguidatv.it/v1/onair',
    'https://www.superguidatv.it/api/v1/channels'
  ];
  for (const t of tries) {
    try {
      const r = await fetch(t, { headers: H, signal: AbortSignal.timeout(15000) });
      const ct = r.headers.get('content-type') || '';
      let preview = '';
      if (/json/.test(ct)) { const j = await r.json(); preview = JSON.stringify(j).slice(0, 200); }
      else preview = (await r.text()).slice(0, 100);
      console.log(r.status, ct.slice(0, 30), '|', t.replace('https://', ''), '\n   ', preview);
    } catch (e) { console.log('ERR', t.replace('https://', ''), e.message.slice(0, 60)); }
  }
})();
