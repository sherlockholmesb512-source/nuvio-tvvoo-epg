(async () => {
  const B = 'https://julia-marie-member-brain.trycloudflare.com';
  const j = await (await fetch(B + '/stream/tv/' + encodeURIComponent('nuvio-pluto:608aa17fb9f4490007e6419a') + '.json')).json();
  const st = j.streams[0];
  console.log('url pubblico:', st.url.slice(0, 75));
  const rm = await fetch(st.url, { signal: AbortSignal.timeout(40000) });
  const mt = await rm.text();
  console.log('master:', rm.status, '| righe -> tunnel:', (mt.match(/trycloudflare/g) || []).length);
  const varLine = mt.split('\n').filter(l => l && !l.startsWith('#')).pop().trim();
  const rv = await fetch(varLine, { signal: AbortSignal.timeout(40000) });
  const vt = await rv.text();
  const seg = vt.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))[0];
  console.log('variante:', rv.status, '| segmenti /pp/:', (vt.match(/\/pp\//g) || []).length);
  const rs = await fetch(seg, { signal: AbortSignal.timeout(60000) });
  const buf = Buffer.from(await rs.arrayBuffer());
  console.log('segmento via tunnel:', rs.status, Math.round(buf.length / 1024) + ' KB');
})().catch(e => console.log('ERR', e.message));
