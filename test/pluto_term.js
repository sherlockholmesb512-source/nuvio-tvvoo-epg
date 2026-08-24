const ID = '608aa17fb9f4490007e6419a';

function build(extra) {
  const q = new URLSearchParams({
    deviceId: 'channel', deviceModel: 'web', deviceVersion: '1.0', appVersion: '1.0',
    deviceType: 'rokuChannel', deviceMake: 'rokuChannel', deviceDNT: '1',
    advertisingId: 'channel', embedPartner: 'rokuChannel', appName: 'rokuchannel',
    is_lat: '1', bmodel: 'bm1', content: 'channel', platform: 'web',
    tags: 'ROKU_CONTENT_TAGS', coppa: 'false', content_type: 'livefeed',
    rdid: 'channel', genre: 'ROKU_ADS_CONTENT_GENRE', content_rating: 'ROKU_ADS_CONTENT_RATING',
    studio_id: 'viacom', channel_id: 'channel', ...extra
  });
  return `https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/${ID}/master.m3u8?${q}`;
}

async function conta(nome, url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const txt = await r.text();
  const varLine = txt.split('\n').filter(l => l && !l.startsWith('#')).pop();
  const vUrl = new URL(varLine.trim(), url).href;
  console.log(nome, '| status:', r.status);
  console.log('  variante:', vUrl.slice(0, 160));
  return vUrl;
}

(async () => {
  await conta('terminate=false (attuale)', build({ terminate: 'false' }));
  const v2 = await conta('terminate=true', build({ terminate: 'true' }));
  const rv = await fetch(v2, { signal: AbortSignal.timeout(20000) });
  const tv = await rv.text();
  const disc = (tv.match(/EXT-X-DISCONTINUITY/g) || []).length;
  const dater = (tv.match(/EXT-X-PROGRAM-DATE-TIME/g) || []).length;
  const segs = tv.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const hosts = [...new Set(segs.map(s => { try { return new URL(s.trim(), v2).host } catch (e) { return '?' } }))];
  console.log('\nvariante terminate=true ->', rv.status, '| seg window:', segs.length, '| DISCONTINUITY:', disc, '| PDT:', dater);
  console.log('host:', hosts.join(', '));
})();
