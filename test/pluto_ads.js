const ID = '608aa17fb9f4490007e6419a';

function buildUrl(extra) {
  const q = new URLSearchParams({
    deviceId: 'channel', deviceModel: 'web', deviceVersion: '1.0', appVersion: '1.0',
    deviceType: 'rokuChannel', deviceMake: 'rokuChannel', deviceDNT: '1',
    advertisingId: 'channel', embedPartner: 'rokuChannel', appName: 'rokuchannel',
    is_lat: '1', bmodel: 'bm1', content: 'channel', platform: 'web',
    tags: 'ROKU_CONTENT_TAGS', coppa: 'false', content_type: 'livefeed',
    rdid: 'channel', genre: 'ROKU_ADS_CONTENT_GENRE', content_rating: 'ROKU_ADS_CONTENT_RATING',
    studio_id: 'viacom', channel_id: 'channel',
    ...extra
  });
  return `https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/${ID}/master.m3u8?${q}`;
}

async function analizza(nome, url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  console.log(`\n=== ${nome} === status ${r.status}`);
  if (!r.ok) { console.log((await r.text()).slice(0, 150)); return; }
  const txt = await r.text();
  const varLine = txt.split('\n').filter(l => l && !l.startsWith('#')).pop();
  const vUrl = new URL(varLine.trim(), url).href;
  console.log('variante contiene serverSideAds=', /serverSideAds=(true|false)/.exec(vUrl)?.[1] || '(assente)');
  const rv = await fetch(vUrl, { signal: AbortSignal.timeout(20000) });
  const tv = await rv.text();
  const lines = tv.split('\n');
  const disc = (tv.match(/EXT-X-DISCONTINUITY/g) || []).length;
  const segs = lines.filter(l => l && !l.startsWith('#'));
  const hosts = [...new Set(segs.map(s => { try { return new URL(s.trim(), vUrl).host } catch (e) { return '?' } }))];
  console.log('segmenti:', segs.length, '| DISCONTINUITY:', disc);
  console.log('host segmenti:', hosts.slice(0, 6).join(', '));
}

(async () => {
  await analizza('ATTUALE (ads on)', buildUrl({}));
  await analizza('serverSideAds=false', buildUrl({ serverSideAds: 'false' }));
})().catch(e => console.log('ERR', e.message));
