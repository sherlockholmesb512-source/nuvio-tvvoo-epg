# TvVoo Guide • Italia — Add-on Nuvio/Stremio

Add-on standalone per **Nuvio** (protocollo Stremio): canali TV italiani VAVOO con guida TV in tempo reale da GuidaTV.

## Sezioni
- **TvVoo • Ora in TV** — tutti i canali con programma in onda, orari e successivo
- **🔎 Cerca** — ricerca canale/programma
- **Samsung TV Plus** — canali FAST con categorie ed EPG
- **Extra & Svizzera** — RSI LA1/LA2 e canali extra

## URL manifest
```
https://<tuo-host>/manifest.json
```

## Avvio locale
```bash
npm start        # porta 7000
```

## Deploy su Render
Il repo include `render.yaml` — usa il pulsante *Deploy to Render* oppure crea un Web Service Node dal repo.

## API principali
| Endpoint | Descrizione |
|---|---|
| `/manifest.json` | manifesto add-on |
| `/catalog/tv/tvvoo_it_epg/genre.json` | catalogo canali |
| `/stream/tv/{id}.json` | stream risolti via VAVOO |
| `/health` | stato servizio |

Licenza MIT.
