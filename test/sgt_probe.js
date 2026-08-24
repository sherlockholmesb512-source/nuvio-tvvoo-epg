(async () => {
  const r = await fetch('https://www.superguidatv.it/ora-in-onda/sky-sport/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept-Language': 'it-IT,it;q=0.9'
    },
    signal: AbortSignal.timeout(25000)
  });
  console.log('status:', r.status);
  const html = await r.text();
  require('fs').writeFileSync(process.env.TEMP + '\\sgt_sport.html', html);
  console.log('salvato', Math.round(html.length / 1024) + ' KB');

  // cerca blocchi di programmi
  const classi = [...new Set((html.match(/class="([^"]{3,60})"/g) || []))];
  const interessanti = classi.filter(c => /prog|event|channel|canale|broadcast|card|item|sched|onair|ora/i.test(c));
  console.log('\nclassi CSS rilevanti:');
  interessanti.slice(0, 40).forEach(c => console.log(' ', c));
})();
