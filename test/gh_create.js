const fs = require('fs');
const TOKEN = process.env.GH_TOKEN;

(async () => {
  const r = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      'Authorization': 'token ' + TOKEN,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'nuvio-addon-deploy'
    },
    body: JSON.stringify({
      name: 'nuvio-tvvoo-epg',
      description: 'Add-on Nuvio/Stremio: canali TV italiani VAVOO con EPG live da GuidaTV + Samsung TV Plus, Extra e Rakuten TV',
      private: false,
      has_issues: true
    })
  });
  const j = await r.json();
  console.log('status:', r.status);
  console.log('full_name:', j.full_name || '-');
  console.log('html_url:', j.html_url || '-');
  if (j.message) console.log('errore:', j.message, JSON.stringify(j.errors || []));
})();
