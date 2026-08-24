(async () => {
  const urls = ['https://www.man-ga.it/', 'https://man-ga.it/', 'https://www.man-ga.it/diretta/'];
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow'
      });
      const t = await r.text();
      console.log(u, '->', r.status, '| len:', t.length);
      const dm = [...new Set((t.match(/dailymotion[^"'\s]*video[^"'\s]*/gi) || []).concat(t.match(/dm_[a-z0-9]{6,}/gi) || []))];
      console.log('  dailymotion refs:', dm.slice(0, 5));
      const m3u8 = t.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
      console.log('  m3u8 inline:', m3u8 ? m3u8[0].slice(0, 120) : 'no');
    } catch (e) {
      console.log(u, 'ERR:', e.message);
    }
  }
})();
