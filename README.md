# TvVoo Guide • Italia — Add-on Nuvio/Stremio

Add-on standalone per **Nuvio** (protocollo Stremio): canali TV italiani VAVOO con guida TV in tempo reale da GuidaTV.

## Sezioni
- **TvVoo • Ora in TV** — tutti i canali con programma in onda, orari e successivo
- **🔎 Cerca** — ricerca canale/programma
- **In onda ora** — canali con telefilm/film in programmazione
- **Pluto TV** — canali FAST con categorie ed EPG
- **Samsung TV Plus** — canali FAST con categorie ed EPG
- **Extra & Svizzera** — RSI LA1/LA2 e canali extra
- **Plex Live TV** — oltre 240 canali italiani via Plex (opzionale, richiede `PLEX_TOKEN`)

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

## Plex Live TV (opzionale)
Per abilitare la sezione Plex Live TV imposta la variabile d'ambiente `PLEX_TOKEN` con un **token di sessione Plex**
(lungo, dal cookie `PlexAuthToken` di `plex.tv`). Senza token la sezione non compare nel manifest.

## API principali
| Endpoint | Descrizione |
|---|---|
| `/manifest.json` | manifesto add-on |
| `/catalog/tv/tvvoo_it_epg/genre.json` | catalogo canali |
| `/stream/tv/{id}.json` | stream risolti via VAVOO |
| `/health` | stato servizio |

Licenza MIT.
