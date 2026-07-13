# Lorenzo Zanna Edge API

Base minima per gestire molti siti su `*.lorenzozanna.com` con contenuti modificabili da API privata e, in futuro, da un assistente AI.

Questa cartella non sostituisce ancora il sito statico nella root. Aggiunge il backend leggero che potra' diventare la sorgente dei contenuti.

## Cosa contiene

- `src/index.mjs`: Cloudflare Worker senza dipendenze esterne.
- `migrations/0001_init.sql`: schema D1 per siti, contenuti e log modifiche.
- `migrations/0002_seed_ph.sql`: contenuti iniziali per `ph.lorenzozanna.com`.
- `.dev.vars.example`: esempio dei segreti locali.
- `wrangler.toml`: configurazione Cloudflare Worker con D1 e custom domain `api.lorenzozanna.com`.

## Stato attuale del deploy

Aggiornato al 4 luglio 2026:

- registrar dominio: Aruba;
- DNS autorevoli: Cloudflare, con `hans.ns.cloudflare.com` e `poppy.ns.cloudflare.com`;
- zona Cloudflare `lorenzozanna.com`: active;
- database D1: `lorenzozanna_content`;
- Worker API: deployato su `https://api.lorenzozanna.com`;
- health check API: `https://api.lorenzozanna.com/api/health`;
- frontend statico: deployato su Cloudflare Pages, progetto `lorenzozanna-ph`;
- URL Pages tecnico: `https://f23ff7f0.lorenzozanna-ph.pages.dev`;
- dominio pubblico frontend: `https://ph.lorenzozanna.com`.
- contenuti reali iniziali: caricati via API privata nel D1 con actor `codex-content-sync`;
- immagini pubbliche: copie ottimizzate in `assets/images/portfolio/`, pubblicate su Pages;
- immagini sorgente originali: archivio locale in `assets/portfolio/portfolio/`, non necessario al deploy Pages.

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
R2: immagini, quando servira'
```

L'AI non modifica HTML, CSS o file di progetto. Chiama endpoint privati e puo' cambiare solo campi strutturati, per esempio titolo hero, bio, descrizione portfolio o contatti.

## Prima di lanciare comandi

Non lanciare `npm run d1:create` se non hai ancora un account Cloudflare e Wrangler autenticato: quel comando parla con Cloudflare e crea una risorsa remota.

Quello che esiste adesso e' solo locale:

```text
edge/
  src/index.mjs
  migrations/
  wrangler.toml
```

Il codice e' pronto, ma non c'e' ancora nulla online.

Nota storica: questa sezione descrive la procedura da zero. Nel progetto attuale D1,
Worker, Pages e i domini `api`/`ph` sono gia' stati creati e deployati.

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

## Prossimo passo nel progetto

Il passo successivo e' collegare le pagine statiche della root a questi contenuti. Si puo' fare in due modi:

- fase semplice: script di build che legge l'API e genera HTML statico;
- fase dinamica: Worker che serve direttamente HTML e contenuti per ogni sottodominio.

Per costi minimi, partirei dalla fase semplice.
