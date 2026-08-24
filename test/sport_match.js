const sport = require('../lib/sport');
const catalogs = require('../lib/catalogs');

(async () => {
  const chs = await sport.loadSport();
  console.log('canali superguidatv:', chs.length);
  const c37 = chs.find(c => c.sgtId === '37');
  console.log('sgt 37:', c37 ? c37.name : 'NON TROVATO');

  const key = await sport.resolveChannelKey('37');
  console.log('key risolta:', key);
  if (!key) return;

  const streams = await catalogs.getStreams(key, null);
  console.log('streams:', streams.length);
  streams.slice(0, 2).forEach(s => {
    console.log(' -', s.name || s.title);
    console.log('   url:', (s.url || '').slice(0, 70));
    console.log('   proxyHeaders:', !!(s.behaviorHints && s.behaviorHints.proxyHeaders));
  });
})().catch(e => console.log('ERR', e.stack.split('\n').slice(0, 4).join(' | ')));
