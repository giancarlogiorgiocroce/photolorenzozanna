# Roadmap MCP remoto per ph.lorenzozanna.com

Data: 2026-07-13
Progetto locale: `C:\Users\gianc\Documents\codice\lorenzozanna`

Questo documento serve come base di lavoro per piu chat parallele. Riassume lo stato attuale, il risultato finale desiderato, i rallentamenti e i problemi da affrontare separatamente.

## Obiettivo finale

Il risultato finale deve avere queste proprieta:

- essere scollegato da GitHub per la gestione ordinaria dei contenuti;
- avere un MCP remoto raggiungibile da ovunque;
- non avere latenza da deploy tra modifica fatta via MCP e contenuto visibile online;
- permettere a Lorenzo di collegare un client AI compatibile al MCP remoto, per esempio Claude, ChatGPT, Codex, Cursor o un agente custom;
- permettere modifiche guidate tramite tool e template forniti dal MCP;
- gestire testi, immagini, link, formattazione leggera, sezioni preimpostate e visibilita delle sezioni.

## Principio architetturale preferito

L'architettura di riferimento non deve essere ChatGPT-centrica o Claude-centrica.

Il prodotto tecnico da costruire e un MCP remoto sicuro, provider-neutral e standard-oriented:

```text
MCP remoto Lorenzo
  /mcp
  tool standard
  auth standard
  ruoli/scopes standard
        |
        + ChatGPT
        + Claude
        + Codex
        + Cursor
        + client MCP generico
        + agente custom
```

ChatGPT, Claude e gli altri host sono consumatori del server, non il centro dell'architettura. Quando un client richiede dettagli specifici, per esempio OAuth metadata per ChatGPT Apps, quei dettagli vanno implementati come layer di compatibilita sopra un nucleo MCP generico.

Scelta pratica:

- prima: MCP HTTP generico con bearer token scoped e revocabile;
- poi: OAuth/metadata standard MCP quando serve compatibilita nativa con client che lo richiedono;
- mai: logica contenutistica o permessi hardcoded per un singolo provider AI.

Il flusso editoriale desiderato e:

```text
Lorenzo scrive in un client AI compatibile
  -> il client usa il remote MCP
  -> MCP autentica Lorenzo
  -> MCP aggiorna D1/R2
  -> il sito legge D1/R2 in tempo reale
  -> refresh pagina: modifica visibile
```

GitHub deve restare utile per sviluppo e versionamento tecnico, non per pubblicare ogni cambio contenutistico.

## Stato attuale del progetto

Esiste gia un backend Cloudflare:

- Worker API su `https://api.lorenzozanna.com`;
- D1 `lorenzozanna_content`;
- API pubblica `https://api.lorenzozanna.com/api/public/sites/ph/content`;
- API privata protetta da `AI_API_TOKEN`;
- dominio frontend pubblico `https://ph.lorenzozanna.com`;
- sito statico deployato su Cloudflare Pages;
- contenuti reali gia scritti in D1.

Esiste gia un MCP locale:

- file server: `mcp/lorenzozanna-server.mjs`;
- client locale: `mcp/call-tool.mjs`;
- transport attuale: `stdio`;
- tool attuali:
  - `get_public_content`;
  - `upsert_content`;
  - `list_changes`;
  - `sync_content_markdown`.

Il MCP locale ha gia funzionato: il change log remoto mostra scritture con actor `mcp-lorenzozanna` in data 2026-07-05.

## Limite principale attuale

Oggi il flusso reale e:

```text
Codex locale
  -> MCP locale stdio
  -> API Cloudflare
  -> D1
  -> sito statico Cloudflare Pages
```

Il problema e che `ph.lorenzozanna.com` oggi serve HTML statico. Quindi D1 puo essere aggiornato correttamente, ma il sito live non cambia finche non viene aggiornato o redeployato il frontend statico.

Questo crea latenza e rende il sistema ancora dipendente da una fase di build/deploy.

## Cosa e MCP, in pratica

MCP e un protocollo client-server che permette a una chat o agente AI di scoprire e invocare tool esterni in modo strutturato.

Componenti:

```text
MCP host/client
  ChatGPT, Claude, Codex, Claude Desktop, Cursor, ecc.

MCP server
  Il servizio che espone tool, risorse e prompt.

Sistemi reali
  Database, storage immagini, API, CMS, sito.
```

Il server MCP non e solo una API REST. Deve descrivere alla chat cosa puo fare e con quale schema. Per esempio:

```text
Tool: disable_section
Input:
  page: "portfolio"
  sectionId: "faq"
Output:
  preview
  stato modifica
  eventuali warning
```

La chat non dovrebbe inventare HTML o chiamate dirette. Dovrebbe scegliere tool predefiniti e compilarli con argomenti strutturati.

## Transport MCP

Transport attuale:

```text
stdio
```

Significa che il client avvia un processo locale. Va bene per sviluppo, Codex locale e test.

Transport necessario per il risultato finale:

```text
Streamable HTTP
```

Significa che il server MCP vive online e ha un endpoint pubblico, per esempio:

```text
https://mcp.lorenzozanna.com/mcp
```

I client compatibili possono collegarsi da Internet. Il server deve gestire autenticazione, sicurezza, sessione e autorizzazioni.

Riferimenti utili:

- MCP overview: https://modelcontextprotocol.io/docs/getting-started/intro
- MCP transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- OpenAI MCP docs: https://developers.openai.com/api/docs/mcp
- Claude remote MCP custom connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

## Nota importante sui client AI

Non bisogna progettare il sistema immaginando che Lorenzo incolli una chiave privata dentro una chat gratuita.

Il flusso corretto e:

```text
Lorenzo aggiunge un custom connector / app MCP
  -> inserisce URL pubblico del MCP
  -> completa autenticazione OAuth o token flow
  -> abilita il connector nella conversazione
```

Claude dichiara supporto ai custom connector via remote MCP anche per utenti Free, con limite di un custom connector e feature in beta.

ChatGPT supporta app/plugin e remote MCP, ma disponibilita e funzioni dipendono da piano, workspace, ruolo, area geografica e superficie supportata. Per ChatGPT va progettata una vera app/connector con auth corretta.

La chiave di Lorenzo non dovrebbe essere passata nel prompt. Deve essere gestita come credenziale del connector.

Questa sezione non cambia il principio architetturale: ChatGPT e Claude sono target di compatibilita, non vincoli di progetto. Se un altro client MCP supporta HTTPS e bearer token o OAuth standard, deve poter usare lo stesso server.

## Architettura finale consigliata

Per eliminare GitHub e deploy dal flusso editoriale:

```text
Cloudflare Worker
  /mcp      remote MCP pubblico
  /api      API interna o pubblica
  /         rendering dinamico del sito

Cloudflare D1
  contenuti strutturati
  pagine
  sezioni
  revisioni
  change log
  utenti e permessi

Cloudflare R2
  immagini originali
  immagini pubblicate
  allegati

Cloudflare Images oppure pipeline immagini
  resize
  WebP/AVIF
  varianti responsive
```

Il sito dovrebbe leggere i contenuti direttamente da D1/R2 a runtime, oppure usare cache molto breve/invalidate immediatamente.

## Modello dati desiderato

Il modello contenuti deve passare da HTML statico o markdown generico a blocchi strutturati.

I blocchi devono seguire i contratti mappati in `MCP_SECTION_CONTRACTS.md`. Il contratto collega dati, markup e CSS esistenti: per esempio `home.hero`, `about.hero`, `contact.hero` e `portfolio.page_hero` sono tutti hero dal punto di vista logico, ma non hanno lo stesso layout.

Per bold, italic e link non si usera HTML libero. Il formato scelto e `rich_text_v1`: blocchi/paragrafi con children testuali, `marks[]` allowlisted e link validati. Il renderer traduce quel JSON in `<strong>`, `<em>` e `<a>` sicuri.

Esempio pagina:

```json
{
  "slug": "portfolio",
  "title": "Portfolio fotografico",
  "seo": {
    "title": "...",
    "description": "..."
  },
  "sections": [
    {
      "id": "hero",
      "type": "hero",
      "enabled": true,
      "order": 10,
      "data": {
        "eyebrow": "Portfolio",
        "title": "Portfolio fotografico",
        "intro": "..."
      }
    },
    {
      "id": "faq",
      "type": "faq",
      "enabled": true,
      "order": 90,
      "data": {
        "items": []
      }
    }
  ]
}
```

Campi minimi per ogni sezione:

- `id`: identificatore stabile;
- `type`: tipo sezione;
- `enabled`: visibile/non visibile;
- `order`: ordinamento;
- `data`: contenuto specifico;
- `updatedAt`;
- `updatedBy`;
- `revisionId`.

Questo permette al MCP di fare modifiche sicure:

- disattivare una sezione senza cancellarla;
- riattivarla;
- riordinare sezioni;
- aggiungere una FAQ;
- validare input prima della pubblicazione;
- fare rollback.

## Tool MCP finali da progettare

Tool di lettura:

- `get_site_snapshot`;
- `list_pages`;
- `get_page`;
- `list_sections`;
- `get_section`;
- `list_section_presets`;
- `list_changes`;
- `get_revision`;

Tool di modifica testi:

- `update_page_meta`;
- `update_text`;
- `update_rich_text`;
- `add_link`;
- `remove_link`;
- `update_cta`;

Tool sezioni:

- `add_section_from_preset`;
- `disable_section`;
- `enable_section`;
- `reorder_sections`;
- `update_section`;
- `duplicate_section`;
- `delete_section_draft_only`;

Tool FAQ:

- `add_faq_section`;
- `add_faq_item`;
- `update_faq_item`;
- `remove_faq_item`;
- `reorder_faq_items`;

Tool immagini:

- `create_image_upload`;
- `confirm_image_upload`;
- `replace_image`;
- `attach_image_to_section`;
- `update_image_alt`;
- `set_image_focal_point`;
- `remove_image_from_section`;

Tool workflow:

- `get_change_template`;
- `validate_change`;
- `preview_change`;
- `apply_change`;
- `publish_change`;
- `rollback_change`;

## Template di cambio forniti dal MCP

Il MCP dovrebbe fornire prompt/template riutilizzabili, non solo tool.

Esempi:

```text
Voglio cambiare il testo hero della pagina X.
Dammi il testo attuale, proponi una versione nuova, validala e poi chiedimi conferma.
```

```text
Voglio togliere le FAQ dalla pagina X senza cancellarle.
Disattiva la sezione FAQ e mostrami l'anteprima del risultato.
```

```text
Voglio aggiungere una sezione FAQ a una pagina che non la ha.
Usa il preset FAQ standard e chiedimi le domande una per volta.
```

```text
Voglio sostituire una immagine.
Prepara upload, chiedimi alt text e punto focale, poi collega l'immagine alla sezione corretta.
```

## Sicurezza e permessi

Non usare una singola chiave master incollata in chat.

Servono:

- autenticazione remota;
- token scoped per sito e ruolo;
- permessi distinti per leggere, modificare bozze, pubblicare, caricare immagini;
- log di ogni azione;
- rollback;
- approvazione esplicita per azioni distruttive;
- protezione da prompt injection;
- validazione schema lato server;
- allowlist dei tipi di sezione e dei campi modificabili.

Ruoli possibili:

```text
owner
  puo fare tutto

editor
  puo modificare contenuti e immagini

publisher
  puo pubblicare

viewer
  puo solo leggere
```

Per Lorenzo probabilmente basta un ruolo `owner` o `editor+publisher`.

## Rallentamenti attuali

1. MCP solo locale

Il server e `stdio`, quindi non e raggiungibile da Claude/ChatGPT via Internet.

2. Sito statico

Il frontend live non legge D1 in tempo reale.

3. Cloudflare Pages

Pages va bene per statico, ma se il requisito e zero latenza post-modifica, il sito dovrebbe essere servito dinamicamente da Worker o comunque invalidato/rigenerato automaticamente.

4. Immagini non gestite dal MCP

Oggi il MCP gestisce soprattutto contenuti testuali e JSON. Per immagini serve R2 o Cloudflare Images.

5. Modello dati ancora non abbastanza modulare

Le sezioni devono diventare entita strutturate e preimpostate, non blocchi HTML o markdown liberi.

6. Auth non pronta per remote connector

`AI_API_TOKEN` va bene per test privato, ma non e ideale come auth finale per Lorenzo.

7. Git non consolidato

Molti file importanti risultano ancora non tracciati localmente. Questo non blocca l'architettura finale, ma va sistemato per non perdere lavoro tecnico.

## Workstream consigliati

### 1. Disegno prodotto MCP

Definire esattamente cosa Lorenzo deve poter chiedere:

- cambio testi;
- cambio meta SEO;
- aggiunta link;
- bold/italic;
- cambio CTA;
- aggiunta sezione;
- sospensione sezione;
- riordino sezioni;
- cambio immagini;
- caricamento immagini;
- rollback.

Output atteso:

- lista tool;
- lista preset;
- lista template conversazionali;
- regole di sicurezza.

### 2. Modello dati D1

Disegnare schema stabile per:

- siti;
- pagine;
- sezioni;
- media;
- revisioni;
- change log;
- utenti/token/permessi.

Output atteso:

- migration SQL;
- esempi JSON;
- piano di migrazione dai contenuti attuali.

### 3. Remote MCP su Cloudflare

Portare il server MCP da `stdio` a `Streamable HTTP`.

Output atteso:

- endpoint `https://mcp.lorenzozanna.com/mcp` oppure route equivalente;
- supporto initialize/tools/list/tools/call via HTTP;
- auth;
- test con MCP Inspector o client compatibile.

### 4. Rendering sito dinamico

Eliminare la dipendenza da deploy statico per i contenuti.

Opzioni:

- Worker che renderizza HTML da D1;
- Worker + template HTML;
- framework SSR compatibile Cloudflare;
- Pages Functions solo se non reintroduce latenza/editorial deploy.

Output atteso:

- `ph.lorenzozanna.com` servito da dati D1/R2;
- modifica D1 visibile con refresh;
- cache controllata.

### 5. Media pipeline

Gestire immagini via MCP.

Output atteso:

- upload sicuro;
- storage R2;
- metadata immagini;
- alt text obbligatorio;
- varianti responsive;
- sostituzione immagine senza toccare HTML.

### 6. Auth e onboarding Lorenzo

Definire come Lorenzo si collega.

Opzioni:

- OAuth vero;
- token personale scoped;
- magic link + token;
- dashboard minima per generare/revocare token.

Output atteso:

- istruzioni per Claude;
- istruzioni per ChatGPT;
- token revocabile;
- niente segreti incollati nei prompt.

### 7. Preview, pubblicazione e rollback

Decidere se ogni modifica e live subito o passa da draft.

Possibili modalita:

```text
safe mode
  modifica in draft
  preview
  publish

fast mode
  modifica pubblicata subito
  rollback sempre disponibile
```

Per un fotografo e sito piccolo, si puo partire con fast mode + rollback.

## Decisioni tecniche da prendere

1. Il sito finale resta su Cloudflare Worker dinamico o si vuole mantenere Pages con rigenerazione automatica?

Consiglio: Worker dinamico, per rispettare il requisito zero deploy latency.

2. Auth finale: OAuth completo o token personale?

Consiglio iniziale: token personale scoped, poi OAuth standard MCP se serve compatibilita migliore con ChatGPT Apps, Claude o altri client che richiedono discovery/authorization metadata. L'OAuth va progettato provider-neutral, non come integrazione esclusiva ChatGPT.

3. Immagini: R2 puro o Cloudflare Images?

Consiglio: R2 per controllo/costi, Cloudflare Images solo se serve trasformazione immagini piu comoda.

4. Pubblicazione: immediata o draft?

Consiglio: immediata per modifiche leggere, draft/preview per cambio immagini o sezioni importanti.

5. MCP unico o separare API e MCP?

Consiglio: stesso Worker, route separate `/mcp`, `/api`, sito pubblico.

## Prompt da usare in altre chat

### Chat architettura MCP remoto

```text
Leggi MCP_REMOTE_ROADMAP.md e concentrati solo su come trasformare l'MCP locale stdio in un MCP remoto Streamable HTTP su Cloudflare Worker. Non occuparti di UI, testi o immagini. Proponi schema endpoint, auth, lifecycle MCP e piano implementativo.
```

### Chat modello dati

```text
Leggi MCP_REMOTE_ROADMAP.md e concentrati solo sul modello dati D1 per pagine, sezioni, media, revisioni e change log. Disegna migration SQL e JSON di esempio compatibili con tool MCP.
```

### Chat rendering dinamico sito

```text
Leggi MCP_REMOTE_ROADMAP.md e concentrati solo su come rendere ph.lorenzozanna.com dinamico da D1/R2 senza dipendere da GitHub o redeploy per i contenuti. Proponi architettura Cloudflare e strategia cache.
```

### Chat immagini

```text
Leggi MCP_REMOTE_ROADMAP.md e concentrati solo su upload, storage e gestione immagini via MCP. Voglio cambio immagine, alt text, focal point, responsive variants e rollback.
```

### Chat onboarding Lorenzo

```text
Leggi MCP_REMOTE_ROADMAP.md e concentrati solo sul flusso utente: come Lorenzo collega Claude/ChatGPT al remote MCP, come si autentica, quali prompt/template vede e come approva le modifiche.
```

## Definizione di "finito"

Il progetto puo dirsi finito quando:

- Lorenzo puo collegare un remote MCP da Claude o ChatGPT senza usare il PC dello sviluppatore;
- il MCP espone tool chiari e sicuri;
- Lorenzo puo modificare testi, sezioni e immagini;
- le modifiche sono visibili online senza commit, push o redeploy manuale;
- esiste rollback;
- esiste log delle modifiche;
- i segreti non vengono incollati in chat;
- GitHub resta solo il luogo del codice, non del contenuto quotidiano.
