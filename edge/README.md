# Lorenzo Zanna Edge API

Cloudflare Worker del sito dinamico e dell'AI CMS di `ph.lorenzozanna.com`.
Gestisce rendering HTML da D1, API, remote MCP, OAuth e pipeline immagini R2.
Cloudflare Pages resta la sorgente degli asset statici; non e' la sorgente dell'HTML live.

## Cosa contiene

- `src/index.mjs`: routing Worker per sito, API, MCP, OAuth e media;
- `src/rendering.mjs`: rendering HTML dinamico da sezioni D1 e asset media;
- `src/mcp-http.mjs`: endpoint MCP remoto e superficie dei tool;
- `src/page-contracts.mjs`: contratti dei campi modificabili;
- `src/media.mjs`: upload, catalogo, usi e modifiche immagini;
- `src/direct-image-upload.mjs`: download controllato, streaming e ispezione firma/dimensioni per il file parameter ChatGPT;
- `migrations/0001`-`0011`: schema, seed, auth/OAuth, tabelle media e metadata editoriali;
- `test/`: suite `node:test` del Worker e dei tool;
- `.dev.vars.example`: esempio dei segreti locali;
- `wrangler.toml`: binding D1/R2, custom domain e route pubbliche.

## Stato attuale del deploy

Aggiornato al 9 agosto 2026:

- registrar dominio: Aruba;
- DNS autorevoli e zona: Cloudflare;
- database D1: `lorenzozanna_content`, migrazioni applicate fino a `0011`;
- bucket R2 privato: `lorenzozanna-media`, binding Worker `MEDIA_BUCKET`;
- Worker API/MCP/rendering: `https://api.lorenzozanna.com`;
- endpoint MCP remoto: `https://api.lorenzozanna.com/mcp`;
- health check API: `https://api.lorenzozanna.com/api/health`;
- sito pubblico: `https://ph.lorenzozanna.com`;
- HTML pubblico: renderizzato dal Worker usando D1/R2;
- CSS, JavaScript e immagini statiche: serviti da Cloudflare Pages, progetto `lorenzozanna-ph`;
- superficie MCP direct-only attesa e testata: 30 tool;
- suite locale documentata dopo il ritiro del fallback: `176/176` test verdi;
- identificativi del deploy verificato riportati nel resoconto operativo;
- immagini sorgente originali: archivio locale in `assets/portfolio/portfolio/`, non necessario al deploy.

Record DNS principali:

```text
api.lorenzozanna.com  -> Worker custom domain
ph.lorenzozanna.com   -> CNAME lorenzozanna-ph.pages.dev, proxied
```

## Modello mentale

```text
api.lorenzozanna.com
ph.lorenzozanna.com
cliente.lorenzozanna.com
qualsiasi.lorenzozanna.com
        |
Cloudflare Worker
        |
D1: contenuti strutturati
R2: immagini/media caricati dal CMS MCP
```

L'AI non modifica HTML, CSS o file di progetto. Chiama endpoint privati e puo' cambiare solo campi strutturati, per esempio titolo hero, bio, descrizione portfolio o contatti.

## Media pipeline

Stato 2026-08-09: l'unico upload pubblico e' `upload_image_file` con file parameter ChatGPT. Collegamento, metadata ricercabili, visibilita, rimozione, riordino, caption e punto focale sono attivi via MCP su D1/R2. `contact.hero` supporta il punto focale anche quando l'immagine e ancora fornita dal fallback del renderer.

`set_media_asset_archived` gestisce archiviazione e ripristino reversibili, audit e blocco degli asset ancora referenziati. Lo smoke live ha confermato che un asset con un uso resta `ready`.
`delete_media_asset` elimina in modo irreversibile solo asset archiviati, inutilizzati e gestiti nel namespace R2 del sito; richiede `confirm: true` e rimuove in cascade le sessioni upload.

Componenti:

- D1: `media_assets`, `media_usages`; `media_uploads` resta come tabella legacy non alimentata;
- R2: bucket privato `lorenzozanna-media` tramite binding `MEDIA_BUCKET`;
- MCP media live: `upload_image_file`, `list_media_assets`, `update_media_asset`, `set_media_asset_archived`, `delete_media_asset`, `replace_image`, `attach_image_to_section`, `remove_image_from_section`, `reorder_images_in_section`, `update_image_caption`, `update_image_alt`, `set_image_focal_point`, `set_image_visibility`;
- nessuna route pubblica `/media/uploads/*`; il fallback corretto e' conservato solo nel kit locale git-ignorato;
- upload diretto ChatGPT live: `upload_image_file` con `_meta["openai/fileParams"]`, `file_id` opaco, HTTPS/redirect/timeout/size controllati, firma e dimensioni reali;
- serving pubblico: `GET/HEAD /media/assets/:assetId/:filename`.

La route pubblica serve solo asset presenti in D1 con `status = ready`; R2 non e' esposto come bucket pubblico generico. Il dominio `ph.lorenzozanna.com` ha una route Worker dedicata per `media/assets/*`, altrimenti Pages risponderebbe con HTML invece dell'immagine.

Manuale operativo completo: `../MCP_MEDIA_PIPELINE.md`.

## Superficie MCP remota

`tools/list` direct-only espone 30 tool:

- lettura: `get_page`, `list_section_presets`, `list_changes`, `list_media_assets`;
- sezioni: `disable_section`, `enable_section`, `add_section_from_preset`;
- FAQ: `add_faq_section`, `add_faq_item`, `update_faq_item`, `remove_faq_item`, `reorder_faq_items`;
- testo e link: `add_text_subsection`, `update_text`, `update_rich_text`, `update_cta`, `update_contact_channel`;
- media: `upload_image_file`, `update_image_alt`, `update_media_asset`, `set_media_asset_archived`, `delete_media_asset`, `replace_image`, `attach_image_to_section`, `remove_image_from_section`, `reorder_images_in_section`, `update_image_caption`, `set_image_focal_point`, `set_image_visibility`;
- revisioni: `rollback_change`.

La checklist operativa e' `../TODO.md`; i contratti dei campi sono in
`../MCP_SECTION_CONTRACTS.md`.

## Prima di lanciare comandi

Non lanciare `npm run d1:create` se non hai ancora un account Cloudflare e Wrangler autenticato: quel comando parla con Cloudflare e crea una risorsa remota.

La procedura seguente e' conservata come guida di bootstrap per un nuovo ambiente.
Nel progetto corrente D1, R2, Worker, Pages, MCP e i domini `api`/`ph` sono gia'
configurati e deployati. Non rieseguire comandi di creazione risorse sul progetto
corrente senza aver prima verificato `wrangler.toml` e lo stato Cloudflare.

## Procedura passo passo

### 0. Crea account Cloudflare

Vai su Cloudflare, crea un account free e conferma email.

Non devi ancora spostare DNS o dominio. Questo passaggio serve solo ad avere un account dove creare Worker e D1.

### 1. Entra nella cartella edge

Da questa cartella:

```powershell
cd C:\Users\gianc\Documents\codice\lorenzozanna\edge
```

### 2. Fai login a Cloudflare

```powershell
npx wrangler login
```

Cosa succede:

- `npx` scarica/usa Wrangler;
- Wrangler apre il browser;
- tu fai login su Cloudflare;
- Wrangler salva una sessione locale per comandare il tuo account.

Alla fine non hai ancora creato database o Worker. Hai solo autorizzato la CLI.

### 3. Crea il database D1 vuoto

```powershell
npm run d1:create
```

Cosa succede:

- Cloudflare crea un database D1 remoto chiamato `lorenzozanna_content`;
- il comando stampa un blocco `[[d1_databases]]`;
- dentro quel blocco trovi un `database_id`.

Alla fine di questo passaggio hai in mano solo un database vuoto su Cloudflare e il suo `database_id`.

### 4. Copia il database_id in wrangler.toml

Apri `wrangler.toml` e sostituisci:

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

con il valore dato da Cloudflare.

Questo collega il Worker locale al database remoto giusto.

### 5. Applica schema e seed in locale, per test

Per applicare lo schema in locale:

```powershell
npm run d1:migrate:local
```

Cosa succede:

- Wrangler crea una copia locale di D1;
- esegue `migrations/0001_init.sql`;
- esegue `migrations/0002_seed_ph.sql`;
- puoi testare senza toccare il database remoto.

Per provarlo in locale:

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

Cosa succede:

- `.dev.vars` contiene il token privato locale;
- Wrangler avvia il Worker sul tuo PC;
- puoi provare rotte tipo `/api/health` e `/api/public/sites/ph/content`.

### 6. Applica schema e seed su Cloudflare

Per applicare le migrazioni su Cloudflare:

```powershell
npm run d1:migrate:remote
```

Cosa succede:

- vengono create le tabelle nel database D1 remoto;
- vengono inseriti i dati iniziali del sito `ph`;
- il database remoto ora e' pronto per essere usato dall'API online.

### 7. Crea il token privato online

Per deployare:

```powershell
npx wrangler secret put AI_API_TOKEN
```

Cosa succede:

- Wrangler ti chiede il valore del token;
- Cloudflare lo salva come segreto;
- il token non finisce nel codice e non va committato.

### 8. Registra il sottodominio workers.dev

Cloudflare richiede un sottodominio account-wide prima di pubblicare su `workers.dev`.

Apri:

```text
https://dash.cloudflare.com/<account-id>/workers/onboarding
```

Scegli un nome tipo:

- `lorenzozanna`, se libero;
- `lorenzozanna-gc`, se il primo non e' disponibile.

Questo produce URL di test simili a:

```text
https://lorenzozanna-edge.lorenzozanna.workers.dev
```

Questo passaggio e' solo per avere un URL temporaneo/test. Il dominio vero `ph.lorenzozanna.com` si collega dopo.

### 9. Se workers.dev mostra `*-null`

Su alcuni account nuovi la UI puo' mostrare il Worker URL come `*-null` anche dopo aver acceso lo switch. In quel caso non perdere tempo con `workers.dev`.

Procedi con il dominio reale:

1. In Cloudflare apri `Domains` / `Domain Overview`.
2. Clicca `Add a domain`.
3. Inserisci `lorenzozanna.com`.
4. Scegli il piano Free.
5. Lascia che Cloudflare importi/scansioni eventuali record DNS.
6. Cloudflare ti dara' due nameserver.
7. Vai su Aruba e sostituisci i nameserver del dominio con quelli dati da Cloudflare.

Finche' i nameserver non vengono cambiati su Aruba, Cloudflare vede la zona ma non puo' servire davvero `api.lorenzozanna.com` o `ph.lorenzozanna.com`.

Per evitare il problema `workers.dev`, questa configurazione usa un Custom Domain:

```toml
workers_dev = false

[[routes]]
pattern = "api.lorenzozanna.com"
custom_domain = true
```

Quindi l'API vivra' su:

```text
https://api.lorenzozanna.com/api/health
https://api.lorenzozanna.com/api/public/sites/ph/content
```

Il sito pubblico `ph.lorenzozanna.com` verra' collegato dopo.

### 10. Deploy del Worker

```powershell
npm run deploy
```

Cosa succede:

- Wrangler carica `src/index.mjs` su Cloudflare;
- Cloudflare ti restituisce un URL `workers.dev`;
- a quel punto l'API esiste online, ma non e' ancora collegata a `ph.lorenzozanna.com`.

### 11. DNS e dominio

Solo dopo il deploy ha senso collegare il dominio:

- o sposti la gestione DNS di `lorenzozanna.com` su Cloudflare;
- oppure crei solo i record necessari dove gestisci i DNS.

Per wildcard vera tipo `*.lorenzozanna.com`, la soluzione piu' pulita e' usare Cloudflare DNS.

## Rotte principali

Pubbliche:

- `GET /api/health`
- `GET /api/public/site`
- `GET /api/public/content`
- `GET /api/public/sites/ph`
- `GET /api/public/sites/ph/content`

Private, con header `Authorization: Bearer <AI_API_TOKEN>`:

- `GET /api/private/schema`
- `GET /api/private/sites`
- `POST /api/private/sites`
- `GET /api/private/sites/ph`
- `PUT /api/private/sites/ph/content/home/hero`
- `POST /api/private/sites/ph/publish`
- `GET /api/private/sites/ph/changes`

## Esempio modifica AI

```http
PUT /api/private/sites/ph/content/home/hero
Authorization: Bearer ...
Content-Type: application/json

{
  "data": {
    "eyebrow": "Firenze / portraits / private events",
    "title": "Lorenzo Zanna",
    "intro": "Fotografie scure, calme, personali. Una selezione essenziale tra volti, dettagli urbani e momenti privati.",
    "primaryCta": {
      "label": "Guarda il portfolio",
      "href": "/portfolio"
    },
    "secondaryCta": {
      "label": "Contatti",
      "href": "/contact"
    }
  },
  "publish": false
}
```

Poi pubblichi solo quando la modifica e' stata controllata:

```http
POST /api/private/sites/ph/publish
Authorization: Bearer ...
Content-Type: application/json

{
  "collection": "home",
  "key": "hero"
}
```

## DNS e sottodomini

Per usare `xxx.lorenzozanna.com` senza creare un record per ogni sito:

1. Porta la zona DNS su Cloudflare o gestisci li' i record.
2. Crea un record wildcard `*` proxied.
3. Collega il Worker alla rotta `*.lorenzozanna.com/api/*` oppure, se il Worker servira' tutto il sito, a `*.lorenzozanna.com/*`.

Cloudflare Pages non supporta wildcard custom domains per Pages, quindi la wildcard vera passa meglio da Worker o da VPS.

## Prossimi passi nel progetto

Il rendering dinamico e la pipeline R2 sono gia' in produzione. Le priorita media
correnti sono:

1. test ChatGPT reale di `upload_image_file` con successivo attach/replace;
2. decodificabilita completa e strip EXIF/GPS durante l'ingestione;
3. thumbnail/preview dedicate e varianti responsive;
4. mantenere il kit fallback locale solo se emerge un requisito concreto per client senza file parameter.

Lo stato completo e ordinato resta in `../TODO.md`.
