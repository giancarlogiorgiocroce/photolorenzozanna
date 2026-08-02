# Manuale per un AI CMS via MCP su Cloudflare

Aggiornato: 2026-08-02

> Questo e' un manuale/template riusabile, non un registro operativo. Lo stato
> corrente e l'unica checklist del progetto sono in `TODO.md`. La pipeline R2,
> il fallback browser e i tool media descritti qui sono implementati. ChatGPT
> supporta file parameter MCP e la produzione espone il tool diretto;
> la prova con un allegato ChatGPT reale resta indicata tra i prossimi passi.

Questo documento descrive come abbiamo costruito il backend MCP per `ph.lorenzozanna.com` e come riapplicare la stessa architettura a un nuovo sito.

L'idea di fondo e' questa: abbiamo costruito un "WordPress per intelligenza artificiale". Non nel senso di una UI admin tradizionale, ma nel senso di una maschera stabile tra contenuti e codice. Il sito resta codice, CSS e renderer. L'AI non scrive HTML libero. L'AI vede blocchi, contratti, campi editabili e strumenti sicuri. Il backend organizza i dati nel formato esatto che il codice si aspetta.

In pratica:

- il codice definisce cosa esiste;
- il database salva contenuti strutturati;
- il renderer trasforma quei contenuti in HTML;
- il server MCP espone strumenti per leggerli e modificarli;
- l'AI usa gli strumenti, non inventa markup.

## Obiettivo

Creare un sistema riusabile per siti piccoli/medi dove:

- il frontend puo essere stilizzato a mano per ogni progetto;
- i contenuti sono modificabili da AI via linguaggio naturale;
- i blocchi sono tipizzati e sicuri;
- ogni modifica e' tracciata;
- e' possibile fare rollback;
- l'auth del cliente e' separata dall'auth amministrativa;
- il sistema e' provider-neutral: ChatGPT, Claude, Codex, Cursor o un client MCP custom sono solo client diversi dello stesso server.

## Accessi necessari

Per replicare il sistema servono questi accessi.

### Cloudflare

Servono:

- account Cloudflare;
- dominio o sottodominio gestito da Cloudflare DNS;
- permesso per creare Worker;
- permesso per creare D1;
- permesso per creare e usare R2;
- permesso per creare Pages;
- permesso per configurare route/custom domain;
- Wrangler autenticato in locale.

Comandi base:

```powershell
npx wrangler login
npx wrangler d1 create <database_name>
npx wrangler d1 migrations apply <database_name> --remote
npx wrangler r2 bucket create <bucket_name>
npx wrangler pages deploy .deploy\ph --project-name <pages_project>
npx wrangler deploy
```

### GitHub

Serve un repository git con:

- codice sorgente;
- migrazioni D1;
- test;
- documentazione;
- file statici o sorgenti del frontend.

Regola: i segreti non vanno mai committati.

### Segreti locali e remoti

Nel progetto corrente:

- `AI_API_TOKEN`: token tecnico, usato per smoke/API privata. Sul canale MCP e' read-only.
- `LORENZO_OAUTH_PASSWORD`: password del login OAuth MVP.
- `.secrets/lorenzo-mcp-token.txt`: token personale Lorenzo in chiaro, solo locale e ignorato.
- `.secrets/lorenzo-oauth-password.txt`: password locale, ignorata.

Nel prossimo progetto conviene usare nomi generici:

```text
AI_API_TOKEN
CLIENT_OAUTH_PASSWORD
.secrets/client-mcp-token.txt
.secrets/client-oauth-password.txt
```

Nel database non si salva mai il token in chiaro, solo l'hash SHA-256.

### Client AI

Per un client bearer-token:

```text
MCP endpoint: https://api.example.com/mcp
Authorization: Bearer <CLIENT_PERSONAL_TOKEN>
```

Per un client OAuth:

```text
MCP server URL: https://api.example.com/mcp
OAuth Client ID: client-dev
Client secret: none
Scopes: content:read content:write
Authorization URL: https://api.example.com/oauth/authorize
Token URL: https://api.example.com/oauth/token
Resource: https://api.example.com/mcp
```

## Impalcatura del progetto

Struttura usata qui:

```text
/
  index.html
  portfolio.html
  about.html
  contact.html
  assets/
    css/
    js/
    images/
  .deploy/
    ph/
      index.html
      assets/...
  edge/
    src/
      index.mjs
      rendering.mjs
      mcp-http.mjs
      auth.mjs
      oauth.mjs
      oauth-metadata.mjs
      pages.mjs
      sections.mjs
      text-sections.mjs
      faq-sections.mjs
      media.mjs
      rollback.mjs
      changes.mjs
      page-contracts.mjs
      section-presets.mjs
    migrations/
      0001_init.sql
      0002_seed_ph.sql
      0003_pages_sections.sql
      0004_seed_pages_from_content_entries.sql
      0005_seed_portfolio_gallery_from_content_entries.sql
      0006_auth_tokens.sql
      0007_oauth_mvp.sql
      0008_seed_contact_band.sql
      0009_media_assets.sql
      0010_media_uploads.sql
      0011_media_asset_metadata.sql
    test/
    wrangler.toml
```

Ruoli dei file principali:

- `edge/src/index.mjs`: Worker, routing HTTP, SEO routes, pagine dinamiche.
- `edge/src/rendering.mjs`: trasforma D1 `page_sections` in HTML.
- `edge/src/mcp-http.mjs`: endpoint MCP JSON-RPC e lista tool.
- `edge/src/auth.mjs`: autenticazione MCP, ruoli, scope.
- `edge/src/oauth.mjs`: OAuth MVP authorization-code + PKCE.
- `edge/src/page-contracts.mjs`: contratti dei blocchi e campi editabili.
- `edge/src/sections.mjs`: update generici di testo, link, rich text, contatti.
- `edge/src/faq-sections.mjs`: tool specializzati per FAQ.
- `edge/src/text-sections.mjs`: operazioni itemizzate sui blocchi editoriali.
- `edge/src/media.mjs`: upload R2, catalogo, usi, metadata e mutazioni immagini.
- `edge/src/rollback.mjs`: rollback sicuro da snapshot.
- `edge/src/section-presets.mjs`: preset dichiarati per sezioni aggiungibili.
- `edge/migrations/*.sql`: schema e seed D1.
- `.deploy/ph`: pacchetto statico da pubblicare su Cloudflare Pages.

## Architettura Cloudflare

Nel progetto corrente:

```text
Cloudflare DNS
  |
  +-- api.lorenzozanna.com -> Worker custom domain
  |
  +-- ph.lorenzozanna.com -> Cloudflare Pages per asset/statici
                       |
                       +-- route Worker esplicite per pagine HTML dinamiche
```

Perche questa divisione:

- Pages serve asset statici, CSS e JavaScript;
- Worker serve HTML dinamico, API, MCP, OAuth e asset R2 pubblici;
- D1 salva contenuti strutturati, revisioni e metadata media;
- R2 salva i file immagine in un bucket privato;
- il Worker serve pubblicamente solo asset D1 con stato `ready`.

Nel `wrangler.toml`:

```toml
name = "lorenzozanna-edge"
main = "src/index.mjs"
compatibility_date = "2026-07-04"
workers_dev = false

[vars]
ROOT_DOMAIN = "lorenzozanna.com"

[[d1_databases]]
binding = "DB"
database_name = "lorenzozanna_content"
database_id = "..."

[[routes]]
pattern = "api.lorenzozanna.com"
custom_domain = true

[[routes]]
pattern = "ph.lorenzozanna.com/"
zone_name = "lorenzozanna.com"

[[routes]]
pattern = "ph.lorenzozanna.com/portfolio"
zone_name = "lorenzozanna.com"
```

Nota importante: se vuoi che il Worker gestisca `/robots.txt`, `/sitemap.xml`, `/index.php` o alias `.html`, devi dichiarare route esplicite. Non basta che il codice Worker sappia gestirli. Se Cloudflare non instrada quel path al Worker, risponde Pages o altro.

## Modello dati D1

### Tabelle principali

```text
sites
  id
  slug
  name
  status

pages
  id
  site_id
  slug
  title
  status

page_sections
  id
  page_id
  section_key
  type
  section_order
  enabled
  data

section_revisions
  id
  section_id
  actor
  action
  before_json
  after_json

change_log
  id
  site_id
  actor
  action
  target
  before_json
  after_json

auth_tokens
  id
  site_id
  token_hash
  label
  actor
  role
  scopes
  status

oauth_authorization_codes
oauth_access_tokens

media_assets
  id
  site_id
  r2_key
  public_url
  mime_type
  width
  height
  size_bytes
  alt
  caption
  status

media_uploads
  id
  asset_id
  upload_token_hash
  status
  expires_at

media_usages
  asset_id
  page_id
  section_id
  path
```

### Concetti chiave

`site`
: Il sito logico. Qui `ph`.

`page`
: Pagina logica. Qui `home`, `portfolio`, `chi-sono`, `contatti`.

`section`
: Blocco dentro una pagina. Ha `section_key`, `type`, `order`, `enabled`, `data`.

`section_key`
: Identificatore stabile del blocco nella pagina. Esempi: `hero`, `text_2`, `gallery`, `contact-band`, `faq`.

`type`
: Tipo logico grezzo: `hero`, `text`, `faq`, `cta`, `gallery`.

`styleContract`
: Contratto reale di rendering/editing. Esempi: `home.hero`, `portfolio.series_text`, `contact.band`.

`media_asset`
: Catalogo D1 di un file immagine R2. Solo gli asset `ready` possono essere collegati e serviti pubblicamente.

`media_usage`
: Riferimento tra asset e path di una sezione. Serve per rollback e per bloccare archive/delete quando un asset e' ancora usato.

La lezione piu importante: `type` non basta. Una `hero` in home non ha lo stesso HTML di una `hero` in portfolio. Il renderer deve risolvere lo `styleContract`. Allo stesso modo, un'immagine non e' un `src` libero: e' un `assetId` validato e risolto dal backend.

## MCP: endpoint e protocollo

Endpoint:

```text
POST https://api.lorenzozanna.com/mcp
```

Formato:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "get_page",
    "arguments": {
      "site": "ph",
      "page": "portfolio"
    }
  }
}
```

Risposta tool:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{ ... }"
      }
    ],
    "structuredContent": {
      "site": "ph",
      "page": "portfolio"
    },
    "isError": false
  }
}
```

Il campo importante per una AI moderna e' `structuredContent`: evita parsing fragile del testo.

## Auth e permessi

### Tre canali

1. Token tecnico `AI_API_TOKEN`
   - usato da noi per smoke/test;
   - su MCP e' limitato a `content:read`;
   - non va dato al cliente;
   - non puo scrivere contenuti.

2. Token personale scoped
   - salvato in D1 come hash;
   - ruolo `editor` per il cliente;
   - scopes tipici: `content:read`, `content:write`;
   - utile per client MCP generici con bearer token.

3. OAuth MVP
   - authorization-code + PKCE S256;
   - metadata pubblici;
   - access token hashato in D1;
   - scadenza 1 ora;
   - utile per ChatGPT o client che richiedono OAuth.

### Ruoli

```text
owner
  content:read
  content:write
  content:publish
  admin:tokens

editor
  content:read
  content:write

publisher
  content:read
  content:publish

viewer
  content:read
```

Per un cliente che deve modificare contenuti, partire da `editor`.

### Regola operativa

```text
MCP lettura/smoke tecnico -> AI_API_TOKEN
MCP modifiche cliente -> token personale o OAuth cliente
Cloudflare/D1/deploy -> credenziali nostre
```

Questo separa bene il rischio: Lorenzo puo cambiare contenuti, ma non puo modificare HTML, CSS, Worker, D1 schema o deploy.

## Discovery OAuth/MCP

Endpoint pubblicati:

```text
https://api.lorenzozanna.com/.well-known/oauth-protected-resource
https://api.lorenzozanna.com/.well-known/oauth-authorization-server
```

Il 401 dell'endpoint MCP include `WWW-Authenticate` con `resource_metadata`.

Tool MCP dichiarano `securitySchemes`:

- read tools: `content:read`;
- write tools: `content:write`.

Questa scelta rende il server provider-neutral. ChatGPT non e' l'architettura: e' solo un client compatibile.

## Contratti: perche esistono

Un contratto dice alla AI:

- quali campi esistono;
- quali sono modificabili;
- quale tool usare;
- che tipo di valore e' ammesso;
- la lunghezza massima;
- se un campo e' link, rich text, booleano o enum;
- come puntare un campo dentro array con path concreti.

Senza contratti l'AI tende a fare due errori:

- inventa HTML;
- inventa campi non supportati dal renderer.

Con i contratti, invece, l'AI vede una mappa sicura:

```json
{
  "sectionId": "faq",
  "type": "faq",
  "styleContract": "common.faq",
  "editableFields": [
    { "path": "title", "kind": "plain_text", "maxLength": 90 },
    { "path": "intro", "kind": "rich_text", "maxLength": 700 },
    { "path": "items[].question", "kind": "plain_text", "maxLength": 160 },
    { "path": "items[].answer", "kind": "rich_text", "maxLength": 700 }
  ]
}
```

## Risoluzione dei contratti

Ordine usato:

1. mapping specifico `pageSlug/section_key`;
2. mapping per `type`;
3. fallback `generic.text`.

Esempi reali:

```text
home/hero                -> home.hero
home/text_2              -> home.selected_work
home/text_3              -> home.split_section
chi-sono/hero            -> about.hero
chi-sono/text_2          -> about.manifesto
chi-sono/text_3          -> about.values_grid
contatti/hero            -> contact.hero
contatti/contact-band    -> contact.band
contatti/text_2          -> contact.availability
portfolio/hero           -> portfolio.page_hero
portfolio/text_2         -> portfolio.series_text
portfolio/gallery        -> portfolio.gallery
*/faq                    -> common.faq
*/cta                    -> common.cta
*/text fallback          -> generic.text
```

## Tipi di campo

### `plain_text`

Stringa semplice. HTML vietato.

Esempi:

```text
title
eyebrow
kicker
image.alt
items[].question
```

Tool: `update_text`.

### `rich_text`

Formato `rich_text_v1`, senza HTML libero.

Supporta:

- blocchi `paragraph`;
- span testuali;
- marks: `bold`, `italic`;
- link sicuri.

Esempio:

```json
{
  "format": "rich_text_v1",
  "blocks": [
    {
      "type": "paragraph",
      "spans": [
        { "text": "Testo ", "marks": [] },
        { "text": "importante", "marks": ["bold"] },
        { "text": " e ", "marks": [] },
        { "text": "leggibile", "marks": ["italic"] },
        { "text": " con link", "marks": [], "link": { "href": "/portfolio" } }
      ]
    }
  ]
}
```

Tool: `update_rich_text`.

Fallback temporaneo: se il contratto dichiara `plainTextTool: "update_text"`, un client semplice puo ancora sostituire il campo con testo plain.

### `link`

Oggetto o href sicuro.

Consenti:

```text
/portfolio
/contact
index.html, portfolio.html, about.html, contact.html (legacy allowlist)
https://...
mailto:...
tel:...
```

Vieta:

```text
javascript:
data:
HTML
..
```

Tool: `update_cta`.

### `boolean`

Usato per visibilita di canali o sezioni.

Valori accettati anche da `update_text` per compatibilita client:

```text
true, false, yes, no, si, abilita, attiva, nascondi, disabilita
```

Per contatti preferire `update_contact_channel`.

### `enum`

Usato per scelte vincolate.

Esempio:

```json
{ "path": "items[].images[].variant", "kind": "enum", "values": ["standard", "wide", "tall"] }
```

## Catalogo blocchi attuale

Questa sezione e' la parte piu riusabile. Ogni blocco ha:

- `sectionId` consigliato;
- `type`;
- `styleContract`;
- shape dati;
- campi editabili;
- comportamento.

### `home.hero`

Uso: hero della home con immagine grande, titolo, intro e due CTA.

```text
page: home
sectionId: hero
type: hero
styleContract: home.hero
```

Shape:

```json
{
  "type": "hero",
  "eyebrow": "Fotografo a Firenze",
  "title": "Lorenzo Zanna Photography",
  "intro": "Testo introduttivo",
  "primaryCta": { "label": "Guarda il portfolio", "href": "/portfolio" },
  "secondaryCta": { "label": "Contatti", "href": "/contact" },
  "image": {
    "src": "assets/images/...",
    "alt": "",
    "width": 1068,
    "height": 1600,
    "decorative": true
  }
}
```

Editable:

```text
eyebrow
title
intro
primaryCta
secondaryCta
image.alt
```

### `home.selected_work`

Uso: griglia di lavori selezionati in home.

```text
page: home
sectionId: text_2
type: text
styleContract: home.selected_work
```

Shape locale:

```json
{
  "kicker": "Selezione",
  "title": "Ritratti, natura, strada",
  "intro": "Breve testo"
}
```

Editable locale:

```text
kicker
title
intro
```

Le card non duplicano immagini o caption nella Home: sono derivate da
`portfolio/gallery`. `get_page(home)` espone `contentDependencies` con la
sezione sorgente e i tool corretti. La copertina di ogni serie e' la prima
immagine abilitata del gruppo; se viene nascosta con `set_image_visibility`, la
Home usa automaticamente la successiva.

Per modificare le card:

```text
etichetta -> portfolio/gallery items[].title con update_text
immagine  -> portfolio/gallery items[].images[].assetId con replace_image
alt       -> portfolio/gallery items[].images[].alt con update_text
focal     -> portfolio/gallery items[].images[].focalPoint con set_image_focal_point
visibilita -> portfolio/gallery items[].images[].enabled con set_image_visibility
```

### `home.split_section`

Uso: testo da un lato e testo/CTA dall'altro. Questo e' il modello base per blocchi editoriali asimmetrici.

```text
page: home
sectionId: text_3
type: text
styleContract: home.split_section
```

Shape:

```json
{
  "kicker": "Selezione",
  "title": "Poche immagini, ben scelte.",
  "text": "Testo o rich_text_v1",
  "cta": { "label": "Scopri l'approccio", "href": "/about" }
}
```

Editable:

```text
kicker
title
text
cta
```

Per un prossimo progetto, se vuoi un blocco "testo da un lato e immagine dall'altro", non forzarlo dentro questo contratto. Crea un contratto dedicato `common.image_text` o `page.image_text`, con `image` esplicita.

### `about.hero`

Uso: hero pagina chi sono, con immagine e testo.

```text
page: chi-sono
sectionId: hero
type: hero
styleContract: about.hero
```

Shape consigliata:

```json
{
  "eyebrow": "Chi sono",
  "title": "Chi e Lorenzo Zanna",
  "intro": "Testo introduttivo",
  "image": {
    "src": "assets/images/...",
    "alt": "Descrizione",
    "width": 1600,
    "height": 1071
  }
}
```

Editable:

```text
eyebrow
title
intro
image.alt
```

### `about.manifesto`

Uso: blocco manifesto/testo editoriale.

```text
page: chi-sono
sectionId: text_2
type: text
styleContract: about.manifesto
```

Shape:

```json
{
  "kicker": "Sguardo",
  "title": "Manifesto",
  "paragraphs": [
    "Paragrafo uno",
    "Paragrafo due"
  ]
}
```

Editable:

```text
kicker
title
paragraphs
```

### `about.values_grid`

Uso: griglia di valori/servizi/punti di metodo.

```text
page: chi-sono
sectionId: text_3
type: text
styleContract: about.values_grid
```

Shape:

```json
{
  "items": [
    {
      "title": "Ritratto",
      "text": "Testo o rich_text_v1"
    }
  ],
  "subsections": [
    {
      "title": "Titolo alternativo",
      "paragraphs": ["Paragrafo"]
    }
  ]
}
```

Editable:

```text
items[].title
items[].text
subsections[].title
subsections[].paragraphs
```

Nota: `items[]` e `subsections[]` sono due shape supportate per compatibilita. Nel prossimo progetto scegli una sola shape per ridurre ambiguita.

### `contact.hero`

Uso: hero contatti.

```text
page: contatti
sectionId: hero
type: hero
styleContract: contact.hero
```

Editable:

```text
eyebrow
title
intro
image.alt
```

### `contact.band`

Uso: banda contatti con email, Instagram, telefono.

```text
page: contatti
sectionId: contact-band
type: text
styleContract: contact.band
```

Shape:

```json
{
  "type": "contact-band",
  "channels": [
    {
      "label": "Email",
      "value": "zannafotografia@icloud.com",
      "href": "mailto:zannafotografia@icloud.com",
      "enabled": true
    },
    {
      "label": "Instagram",
      "value": "@lorenzo",
      "href": "https://instagram.com/...",
      "enabled": false
    },
    {
      "label": "Telefono",
      "value": "123123123",
      "href": "tel:123123123",
      "enabled": true
    }
  ]
}
```

Editable:

```text
channels[].label
channels[].value
channels[].href
channels[].enabled
```

Tool preferito:

```text
update_contact_channel
```

Esempio:

```json
{
  "site": "ph",
  "page": "contatti",
  "channel": "telefono",
  "value": "123123123",
  "enabled": true
}
```

Comportamento speciale:

- se aggiorni email senza `href`, il sistema deriva `mailto:...`;
- se aggiorni telefono senza `href`, il sistema deriva `tel:...`;
- se `enabled=false`, il canale resta nel dato ma non viene renderizzato;
- il renderer mostra `<a>` se c'e href sicuro, altrimenti `<div>`.

Problema risolto: inizialmente il telefono cambiava valore ma restava non cliccabile perche `href` era `null`. La soluzione e' stata derivare `tel:` sia nel renderer sia negli update tool.

### `contact.availability`

Uso: lista di informazioni pratiche nella pagina contatti.

```text
page: contatti
sectionId: text_2
type: text
styleContract: contact.availability
```

Shape:

```json
{
  "kicker": "Richieste",
  "title": "Come inviare una richiesta utile",
  "items": [
    "Ritratto, lavoro per attivita, collaborazione, stampa.",
    "Se hai una scadenza o un luogo, scrivilo subito."
  ]
}
```

Editable:

```text
kicker
title
items[]
subsections[].title
subsections[].paragraphs
```

### `portfolio.page_hero`

Uso: hero semplice portfolio.

```text
page: portfolio
sectionId: hero
type: hero
styleContract: portfolio.page_hero
```

Shape:

```json
{
  "eyebrow": "Portfolio",
  "title": "Portfolio fotografico",
  "intro": "Ritratti, strada, natura, forme e ombre."
}
```

Editable:

```text
eyebrow
title
intro
```

### `portfolio.series_text`

Uso: testo editoriale con serie/categorie.

```text
page: portfolio
sectionId: text_2
type: text
styleContract: portfolio.series_text
```

Shape:

```json
{
  "title": "Serie",
  "paragraphs": ["Introduzione"],
  "subsections": [
    {
      "title": "Ritratti",
      "paragraphs": [
        "Persone, posture, riflessi, distanza."
      ]
    },
    {
      "title": "Strada",
      "paragraphs": [
        "Figure che attraversano, archi, vetri, ombre profonde."
      ]
    }
  ]
}
```

Editable:

```text
title
paragraphs
subsections[].title
subsections[].paragraphs
```

Problema risolto: il fallback generico renderizzava questa sezione senza lo stile giusto. La soluzione e' stata creare `portfolio.series_text` e renderer `editorial-section`, invece di usare `<section class="section">`.

### `portfolio.gallery`

Uso: galleria portfolio divisa per serie.

```text
page: portfolio
sectionId: gallery
type: gallery
styleContract: portfolio.gallery
```

Shape attuale:

```json
{
  "items": [
    {
      "key": "ritratti",
      "title": "Ritratti",
      "images": [
        {
          "assetId": "asset_123",
          "alt": "Ritratto sovrapposto a riflessi di rami",
          "caption": "Ritratto",
          "variant": "wide",
          "enabled": true,
          "focalPoint": { "x": 50, "y": 45 }
        }
      ]
    }
  ]
}
```

Campi e tool:

```text
items[].title                    -> update_text
items[].images                   -> attach_image_to_section / remove_image_from_section / reorder_images_in_section
items[].images[].assetId         -> replace_image
items[].images[].alt             -> update_text oppure update_image_alt sull'asset
items[].images[].caption         -> update_image_caption, fallback update_text
items[].images[].variant         -> update_text, enum standard|wide|tall
items[].images[].focalPoint      -> set_image_focal_point
items[].images[].enabled         -> set_image_visibility
```

`src`, MIME, width e height vengono risolti da `media_assets` e non sono
editabili direttamente. Le immagini con `enabled: false` restano nella sezione e
nel catalogo, ma non vengono renderizzate. `items[].key` e' identita strutturale
e resta non editabile.

Funzionalita ancora aperte:

- prova reale dell'upload diretto dal connector, mantenendo il fallback provider-neutral;
- decodificabilita completa oltre la firma e le dimensioni reali gia verificate;
- thumbnail e varianti responsive;
- strip EXIF/GPS.

Problema risolto: le immagini `forme e ombre` erano quadrate/in colonna perche mancava una strategia layout. Abbiamo introdotto pattern curati (`standard`, `wide`, `tall`) nel renderer.

Problema risolto: il lightbox apriva una singola immagine ma non permetteva di scorrere la galleria. Abbiamo aggiunto navigazione prev/next.

### `common.faq`

Uso: FAQ riusabile su qualsiasi pagina.

```text
sectionId: faq
type: faq
styleContract: common.faq
```

Shape:

```json
{
  "title": "Domande frequenti",
  "intro": "Risposte pratiche.",
  "items": [
    {
      "question": "Che informazioni devo mandare?",
      "answer": "Tipo di progetto, luogo, tempi e uso delle immagini."
    }
  ]
}
```

`answer` puo essere plain text o `rich_text_v1`.

Editable:

```text
title
intro
items[].question
items[].answer
```

Tool specializzati:

```text
add_faq_section
add_faq_item
update_faq_item
remove_faq_item
reorder_faq_items
```

Regole:

- massimo 12 item;
- `sectionId` deve essere `faq`;
- se la FAQ esiste ma e' disabilitata, `add_faq_section` la riabilita;
- non duplica sezioni FAQ;
- HTML vietato;
- tutte le modifiche registrano revision/change log.

Questo blocco e' il modello migliore per costruire nuovi blocchi itemizzati.

### `common.cta`

Uso: call to action generica.

```text
type: cta
styleContract: common.cta
```

Shape:

```json
{
  "kicker": "Contatti",
  "title": "Parliamo del tuo progetto",
  "text": "Testo descrittivo",
  "primaryCta": {
    "label": "Scrivi",
    "href": "/contact"
  }
}
```

Editable:

```text
kicker
title
text
primaryCta
```

### `generic.text`

Uso: fallback e blocco testo generico.

```text
type: text
styleContract: generic.text
```

Shape:

```json
{
  "title": "Titolo",
  "paragraphs": [
    "Paragrafo uno",
    "Paragrafo due"
  ],
  "subsections": [
    {
      "title": "Sottotitolo",
      "paragraphs": ["Testo"]
    }
  ]
}
```

Editable:

```text
title
paragraphs
subsections[].title
subsections[].paragraphs
```

Consiglio: usare `generic.text` solo come fallback o per blocchi davvero generici. Per blocchi visivamente importanti, creare un contratto dedicato.

## Come costruire un nuovo contratto

Procedura consigliata:

1. Leggi HTML e CSS esistenti.
2. Identifica il blocco visivo reale.
3. Decidi se e' comune o page-specific.
4. Dai un nome allo `styleContract`.
5. Definisci una shape dati JSON minima.
6. Definisci `editableFields`.
7. Aggiungi mapping in `page-contracts.mjs`.
8. Aggiungi renderer in `rendering.mjs`.
9. Aggiungi test renderer.
10. Aggiungi eventuali tool specializzati.
11. Aggiungi migration/seed.
12. Fai smoke MCP `get_page`.

### Esempio: costruire FAQ

Shape:

```json
{
  "title": "FAQ",
  "intro": "Risposte pratiche.",
  "items": [
    { "question": "Domanda", "answer": "Risposta" }
  ]
}
```

Contratto:

```js
"common.faq": {
  styleContract: "common.faq",
  editableFields: [
    { path: "title", kind: "plain_text", maxLength: 90 },
    { path: "intro", kind: "rich_text", maxLength: 700 },
    { path: "items[].question", kind: "plain_text", maxLength: 160 },
    { path: "items[].answer", kind: "rich_text", maxLength: 700 }
  ]
}
```

Perche tool specializzati:

- `update_text` puo cambiare `items[2].question`;
- ma aggiungere/rimuovere/riordinare item richiede logica di array;
- meglio dare alla AI strumenti semantici: `add_faq_item`, `remove_faq_item`, `reorder_faq_items`.

### Esempio: blocco immagine + testo

Consiglio per prossimo progetto:

```text
styleContract: common.image_text
sectionId: image-text oppure text_2 se page-specific
type: text
```

Shape consigliata:

```json
{
  "kicker": "Metodo",
  "title": "Titolo",
  "text": {
    "format": "rich_text_v1",
    "blocks": []
  },
  "image": {
    "assetId": "asset_...",
    "src": "assets/images/...",
    "alt": "Descrizione",
    "width": 1600,
    "height": 1200,
    "decorative": false,
    "position": "right"
  },
  "cta": {
    "label": "Scopri",
    "href": "/about"
  }
}
```

Editable:

```text
kicker
title
text
image.alt
image.decorative
image.position = left|right
cta
```

Non permettere `image.src` libero via AI. L'AI deve scegliere un `assetId` da `list_media_assets` oppure creare un upload con i tool media dedicati.

## Tool MCP disponibili

La superficie MCP verificata live espone 32 tool. Le categorie sono:

- lettura: pagina, preset, change log e catalogo media;
- contenuti: testo, rich text, CTA, contatti e sottosezioni;
- sezioni e FAQ: aggiunta controllata, visibilita e operazioni itemizzate;
- media: upload, catalogo ricercabile, lifecycle asset, attach, remove, reorder, caption, replace, alt, focal point e visibilita;
- revisioni: rollback con protezione stale.

### `get_page`

Legge pagina strutturata con sezioni, dati e contratti.

Esempio:

```json
{
  "name": "get_page",
  "arguments": {
    "site": "ph",
    "page": "contatti"
  }
}
```

Usalo sempre prima di modificare.

### `list_section_presets`

Elenca preset sezioni.

Attualmente:

```text
faq      addable=true
text     addable=false
cta      addable=false
gallery  addable=false
image_text addable=false
```

Il fatto che un preset sia dichiarato ma non addable e' utile: comunica la direzione senza permettere operazioni premature.

### `update_text`

Modifica campo plain text o campo rich text in fallback plain.

Esempio:

```json
{
  "name": "update_text",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "hero",
    "path": "title",
    "value": "Portfolio fotografico"
  }
}
```

Esempio array:

```json
{
  "name": "update_text",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "faq",
    "path": "items[0].question",
    "value": "Come posso richiedere una stampa?"
  }
}
```

### `update_rich_text`

Modifica campo `rich_text`.

```json
{
  "name": "update_rich_text",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "faq",
    "path": "items[0].answer",
    "value": {
      "format": "rich_text_v1",
      "blocks": [
        {
          "type": "paragraph",
          "spans": [
            { "text": "Scrivimi indicando ", "marks": [] },
            { "text": "formato", "marks": ["bold"] },
            { "text": " e fotografia.", "marks": [] }
          ]
        }
      ]
    }
  }
}
```

### `update_cta`

Modifica link contrattualizzato.

```json
{
  "name": "update_cta",
  "arguments": {
    "site": "ph",
    "page": "home",
    "sectionId": "hero",
    "path": "primaryCta",
    "label": "Guarda il portfolio",
    "href": "/portfolio"
  }
}
```

### `update_contact_channel`

Modifica email, telefono, Instagram per nome semantico.

```json
{
  "name": "update_contact_channel",
  "arguments": {
    "site": "ph",
    "page": "contatti",
    "channel": "email",
    "value": "zannafotografia@icloud.com",
    "enabled": true
  }
}
```

Nascondere telefono:

```json
{
  "name": "update_contact_channel",
  "arguments": {
    "site": "ph",
    "page": "contatti",
    "channel": "telefono",
    "enabled": false
  }
}
```

### FAQ item tools

Aggiungere FAQ:

```json
{
  "name": "add_faq_item",
  "arguments": {
    "site": "ph",
    "page": "contact",
    "question": "Quanto dura una sessione?",
    "answer": "Dipende dal progetto, ma lo concordiamo prima."
  }
}
```

Riordinare:

```json
{
  "name": "reorder_faq_items",
  "arguments": {
    "site": "ph",
    "page": "contact",
    "order": [1, 0, 2, 3]
  }
}
```

### `disable_section` / `enable_section`

Nasconde o mostra una sezione senza cancellarla.

```json
{
  "name": "disable_section",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "faq"
  }
}
```

### `list_changes`

Legge modifiche recenti.

```json
{
  "name": "list_changes",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "faq",
    "limit": 10
  }
}
```

### `rollback_change`

Rollback sicuro.

```json
{
  "name": "rollback_change",
  "arguments": {
    "site": "ph",
    "changeId": "..."
  }
}
```

Oppure ultimo cambio su pagina/sezione:

```json
{
  "name": "rollback_change",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "faq"
  }
}
```

Protezione importante: se lo stato corrente non coincide con lo snapshot `after` della modifica da annullare, il rollback viene bloccato. Questo evita di sovrascrivere modifiche successive.

### Tool media

Catalogo, lifecycle e upload:

```text
list_media_assets
update_media_asset
set_media_asset_archived
delete_media_asset
upload_image_file
create_image_upload
confirm_image_upload
```

Modifica e collegamento:

```text
attach_image_to_section
remove_image_from_section
reorder_images_in_section
update_image_caption
replace_image
update_image_alt
set_image_focal_point
set_image_visibility
```

Flusso diretto attuale in produzione:

1. associare l'allegato al campo `file` e chiamare `upload_image_file` con alt;
2. ricevere l'asset gia `ready`;
3. collegarlo con `attach_image_to_section` o `replace_image`;
4. verificare con `get_page` e con il rendering pubblico.

Fallback per client senza file parameter:

1. chiamare `create_image_upload` e mostrare `upload.uploadPageUrl`;
2. caricare i byte dal browser e chiamare `confirm_image_upload`;
3. collegare l'asset `ready` con attach/replace.

La specifica OpenAI Plugins corrente consente inoltre di dichiarare un campo
file top-level in `_meta["openai/fileParams"]`. ChatGPT passa
`download_url`, `file_id` e gli eventuali `mime_type`/`file_name`, non il base64
nel JSON-RPC. La produzione implementa `upload_image_file`: download HTTPS
controllato, massimo 3 redirect, timeout, limite 12 MB, firma e dimensioni reali,
streaming R2 e scrittura atomica catalogo/audit con cleanup. Restituisce un asset
`ready`; attach e replace restano operazioni separate. Il fallback browser resta
disponibile per i client senza file parameter.
Riferimento: https://developers.openai.com/plugins/reference#define-file-inputs

Esempio visibilita reversibile:

```json
{
  "name": "set_image_visibility",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "gallery",
    "path": "items[0].images[4]",
    "enabled": false
  }
}
```

Questo nasconde l'uso senza cancellare l'asset. Nel sorgente locale
`remove_image_from_section` toglie l'uso conservando l'asset,
`reorder_images_in_section` applica una permutazione completa e
`update_image_caption` cambia o rimuove la didascalia del singolo uso. Rimozione
e riordino riallineano `media_usages`; tutte le mutazioni sono revisionate e
reversibili. `set_media_asset_archived` e `delete_media_asset` completano il lifecycle: la cancellazione fisica richiede asset archiviato, zero usi e conferma esplicita.

## Renderer dinamico

Il renderer:

1. legge `site`;
2. legge `page`;
3. legge `page_sections` abilitate in ordine;
4. normalizza ciascuna sezione;
5. risolve lo `styleContract`;
6. chiama il renderer specifico;
7. produce HTML completo con header, meta, asset, footer.

Regole:

- mai renderizzare usando solo `type`;
- mai dare per scontato che due `hero` siano uguali;
- ogni blocco visivo importante ha un renderer dedicato;
- fallback `generic.text` solo se accettabile;
- i test devono verificare classi CSS reali, non solo testo.

## SEO e URL canonici

Problema rilevato: `index.html`, `index.php` e `/` potevano essere trattate come pagine diverse.

Soluzione:

- logo verso `/`;
- link interni slashless;
- canonical nel `<head>`;
- `og:url`;
- redirect 301:
  - `/index.html` -> `/`;
  - `/index.php` -> `/`;
  - `/portfolio.html` -> `/portfolio`;
  - `/about.html` -> `/about`;
  - `/contact.html` -> `/contact`;
- `robots.txt`;
- `sitemap.xml`.

Checklist live:

```text
GET /                  -> 200 HTML, canonical /
GET /index.html        -> 301 /
GET /index.php         -> 301 /
GET /sitemap.xml       -> 200 application/xml
GET /robots.txt        -> 200 text/plain
```

## Cookie/privacy

Verificato:

- niente `Set-Cookie`;
- niente `document.cookie`;
- niente `localStorage`;
- niente `sessionStorage`;
- niente `indexedDB`;
- niente analytics/beacon/pixel.

Soluzione UI finale:

- niente banner automatico;
- link `Cookie privacy` nel footer vicino al copyright;
- pannello `Nessun cookie` nascosto di default;
- apertura solo su click;
- chiusura con X o Escape;
- nessuno storage per ricordare la chiusura.

Questo evita il paradosso: usare storage/cookie per dire che non usiamo cookie.

## Workflow TDD consigliato

Per ogni nuova feature:

1. Scrivi un test che fallisce.
2. Implementa il minimo.
3. Esegui `npm test`.
4. Aggiorna docs/TODO.
5. Deploy Pages se cambia asset statico.
6. Deploy Worker se cambia HTML/API/MCP.
7. Smoke live.
8. Commit.
9. Push.

Comandi:

```powershell
cd edge
npm test
npx wrangler deploy
```

Per Pages:

```powershell
Copy-Item -LiteralPath index.html,portfolio.html,about.html,contact.html -Destination .deploy\ph -Force
Copy-Item -LiteralPath assets\css\base.css -Destination .deploy\ph\assets\css\base.css -Force
Copy-Item -LiteralPath assets\js\main.js -Destination .deploy\ph\assets\js\main.js -Force
npx wrangler pages deploy .deploy\ph --project-name lorenzozanna-ph
```

## Smoke test remoti utili

### Verificare HTML dinamico

```powershell
curl.exe -sS https://ph.lorenzozanna.com/portfolio
```

### Verificare redirect

```powershell
curl.exe -sSI https://ph.lorenzozanna.com/index.php
```

### Verificare assenza cookie

```js
const paths = ["/", "/portfolio", "/about", "/contact"];
for (const path of paths) {
  const response = await fetch(`https://ph.lorenzozanna.com${path}`);
  console.log(path, response.status, response.headers.get("set-cookie"));
}
```

### Chiamare MCP

```js
const token = "<TOKEN>";
const response = await fetch("https://api.lorenzozanna.com/mcp", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "1",
    method: "tools/call",
    params: {
      name: "get_page",
      arguments: { site: "ph", page: "portfolio" }
    }
  })
});
console.log(await response.json());
```

## Problemi incontrati e soluzioni

### Il sito live era "rotto" dopo il passaggio dinamico

Causa: il renderer usava `type` generico invece di `styleContract`.

Soluzione:

- mappare `page/sectionId -> styleContract`;
- aggiungere renderer specifici;
- testare classi HTML/CSS specialistiche;
- confrontare statico locale, GitHub e live.

### `portfolio/text_2` aveva stile sbagliato

Causa: fallback generico per una sezione editoriale.

Soluzione:

- contratto `portfolio.series_text`;
- renderer `editorial-section`;
- CSS e markup allineati agli statici.

### `contact-band` non era modificabile

Causa: il blocco contatti era markup fisso dentro hero, non una sezione D1 autonoma.

Soluzione:

- migration `0008_seed_contact_band.sql`;
- sezione `contact-band`;
- contratto `contact.band`;
- renderer da `channels[]`;
- tool `update_contact_channel`.

### ChatGPT non vedeva tool contatti

Causa: schema MCP troppo rigido/complesso per alcuni client.

Soluzione:

- semplificare schema `update_contact_channel`;
- usare `channel` enum `email|instagram|telefono`;
- `href` string opzionale;
- aggiungere fallback `update_text` per booleani `channels[].enabled`.

### Cambiare telefono non rendeva il link cliccabile

Causa: `value` cambiava ma `href` restava `null`.

Soluzione:

- derivare `tel:` in `update_text`;
- derivare `tel:` in `update_contact_channel`;
- fallback renderer: se canale telefono ha value valido ma href manca, genera `tel:`.

### OAuth sembrava ChatGPT-specifico

Causa: ChatGPT chiedeva OAuth Client ID.

Soluzione concettuale:

- server MCP resta generico;
- OAuth e' layer di compatibilita;
- client id hardcoded solo MVP;
- ruoli/scope uguali per tutti.

### `AI_API_TOKEN` troppo potente

Causa: token tecnico poteva essere confuso con token cliente.

Soluzione:

- su MCP `AI_API_TOKEN` e' `content:read`;
- scrittura solo con token utente/OAuth;
- Cloudflare/admin restano nostri.

### `robots.txt` e `sitemap.xml` non rispondevano dal Worker

Causa: route Cloudflare mancanti.

Soluzione:

- aggiungere route esplicite nel `wrangler.toml`;
- deploy Worker;
- smoke con `curl -I`.

### Sitemap serviva HTML per cache/Pages

Causa: vecchia risposta Pages o route non ancora propagata.

Soluzione:

- route Worker esplicita;
- controllo `Cache-Control: no-cache`;
- riprovare dopo deploy/propagazione.

### Asset CSS/JS vecchi dopo deploy

Causa: Pages serve asset e browser/CDN possono cacheare.

Soluzione:

- aggiornare `.deploy/ph`;
- deploy Pages;
- cambiare `ASSET_VERSION` nel renderer;
- smoke asset con query nuova.

### Banner cookie fastidioso

Causa: overlay automatico senza persistenza richiedeva chiusura continua.

Soluzione:

- non aprirlo automaticamente;
- link `Cookie privacy` nel footer;
- pannello nascosto;
- niente storage.

## Come adattare un sito esistente

Procedura:

1. Congela gli HTML statici come reference.
2. Mappa ogni sezione visibile.
3. Per ogni sezione scrivi:
   - `sectionId`;
   - `type`;
   - `styleContract`;
   - shape dati;
   - editable fields.
4. Crea migrazione D1 che seeda `pages` e `page_sections`.
5. Scrivi renderer dinamico che riproduce lo statico.
6. Aggiungi `get_page`.
7. Aggiungi update tool generici.
8. Solo dopo aggiungi tool specializzati.
9. Confronta HTML statico/dinamico.
10. Deploya e smoke live.

Regola: se un elemento e' visibile nel sito, deve essere o:

- una sezione D1 autonoma;
- oppure un gruppo dichiarato dentro un contratto piu grande.

Non lasciare blocchi speciali nascosti nel renderer senza contratto.

## Come creare un nuovo blocco addable

Per renderlo davvero "AI-ready", non basta dichiarare il contratto. Servono:

- preset in `section-presets.mjs`;
- `addable: true`;
- tool di creazione;
- regole di ordine;
- regole anti-duplicazione;
- renderer;
- test.

Esempio per un blocco `common.image_text`:

```js
{
  id: "image_text",
  title: "Image + Text",
  type: "text",
  styleContract: "common.image_text",
  defaultSectionId: "image-text",
  addable: true,
  addTool: "add_image_text_section",
  allowsHtml: false
}
```

Poi tool:

```text
add_image_text_section
update_image_text_image
```

Non usare `update_text path=image.src`: usare sempre un tool media-aware basato su `assetId`.

## Gestione immagini attuale ed evoluzioni

La pipeline media non usa stringhe `src` fornite dall'AI. I file vivono nel
bucket R2 privato; D1 conserva catalogo, sessioni di upload e usi:

```text
R2 lorenzozanna-media
  ph/uploads/<assetId>/<filename>

D1 media_assets
  asset, r2_key, public_url, MIME, dimensioni, alt, caption, status

D1 media_uploads
  sessione temporanea, token hashato, scadenza, stato

D1 media_usages
  asset, pagina, sezione, path
```

Il Worker serve `GET/HEAD /media/assets/:assetId/:filename` solo quando l'asset
esiste in D1, ha stato `ready` e l'oggetto esiste in R2.

Tool implementati:

```text
list_media_assets
update_media_asset
set_media_asset_archived
upload_image_file
delete_media_asset
create_image_upload
confirm_image_upload
attach_image_to_section
remove_image_from_section
reorder_images_in_section
update_image_caption
replace_image
update_image_alt
set_image_focal_point
set_image_visibility
```

Il fallback `uploadPageUrl` consente a ChatGPT e agli altri client di completare
l'upload dal browser con il descriptor corrente. Il token resta nel fragment URL,
scade dopo 15 minuti ed e' salvato nel database solo come hash. Questo flusso e'
stato verificato end-to-end fino a R2 e all'attach nel portfolio.

ChatGPT supporta ora file parameter MCP tramite `_meta["openai/fileParams"]` e
passa un URL temporaneo con `file_id`. La produzione implementa
`upload_image_file`, valida download, firma e dimensioni e trasferisce lo stream
in R2; resta da provarlo con un allegato ChatGPT reale. Il fallback browser non
va rimosso perche mantiene la compatibilita provider-neutral.

Regole:

- l'AI non scrive mai `src` arbitrari;
- un collegamento accetta solo `assetId` dello stesso sito con stato `ready`;
- alt obbligatorio per immagini informative;
- MIME dichiarati consentiti: JPEG, PNG, WebP e AVIF; SVG vietato;
- limite upload: 12 MB;
- `set_image_visibility` nasconde un uso senza cancellare dati o asset;
- `remove_image_from_section` rimuove un uso, conserva l'asset e riallinea tutti i path `media_usages`;
- `reorder_images_in_section` richiede una permutazione completa e riallinea i path degli usi;
- `update_image_caption` modifica o cancella la caption del singolo uso senza cambiare l'asset globale;
- gallery e Home derivata ignorano immagini con `enabled: false`;
- revisioni, change log e `media_usages` accompagnano le mutazioni contenuto.

Shape gallery corrente:

```json
{
  "items": [
    {
      "key": "ritratti",
      "title": "Ritratti",
      "images": [
        {
          "assetId": "asset_123",
          "alt": "Ritratto sovrapposto a riflessi",
          "caption": "Ritratto",
          "variant": "wide",
          "enabled": true,
          "focalPoint": { "x": 50, "y": 45 }
        }
      ]
    }
  ]
}
```

Evoluzioni ancora aperte:

- test connector reale dell'upload diretto con file parameter ChatGPT;
- verifica di decodificabilita completa oltre magic bytes e dimensioni reali;
- strip EXIF/GPS;
- thumbnail e varianti responsive AVIF/WebP/JPG;
- valutazione di scansione malware e quote/rate limit specifici per upload.

## Sequenza template per il prossimo sito

Questa e' una traccia riutilizzabile, non una seconda checklist del progetto
corrente.

### Fase 1: base Cloudflare

```text
- dominio su Cloudflare DNS
- Worker creato
- D1 creato
- bucket R2 creato e binding configurato
- Pages creato
- wrangler.toml configurato
- secrets configurati
- route API e pagine configurate
```

### Fase 2: data model

```text
- sites
- pages
- page_sections
- section_revisions
- change_log
- auth_tokens
- oauth tables se serve
- media_assets
- media_uploads
- media_usages
```

### Fase 3: blocchi

```text
- lista pagine
- lista sezioni visibili
- styleContract per ogni sezione importante
- data shape per ogni contratto
- editableFields per ogni contratto
- renderer per ogni contratto
- fallback generic.text solo dove accettabile
```

### Fase 4: MCP

```text
- initialize
- tools/list
- get_page
- list_section_presets
- update_text
- update_rich_text
- update_cta
- enable_section
- disable_section
- list_changes
- rollback_change
- tool specializzati per blocchi itemizzati
- list_media_assets
- create_image_upload / confirm_image_upload
- upload_image_file con file parameter, piu fallback browser per client senza supporto
- update_media_asset / set_media_asset_archived / delete_media_asset
- attach_image_to_section / remove_image_from_section / reorder_images_in_section / replace_image
- update_image_caption / update_image_alt / set_image_focal_point / set_image_visibility
```

### Fase 5: auth

```text
- AI_API_TOKEN read-only su MCP
- token cliente hashed in D1
- ruolo editor
- OAuth metadata se richiesto dal client
- password OAuth o login provider
- revoca token
```

### Fase 6: deploy e smoke

```text
- npm test
- deploy Pages se cambiano asset
- deploy Worker
- smoke pagine 200
- smoke redirect
- smoke sitemap/robots
- smoke MCP get_page
- smoke modifica reversibile
- smoke rollback
- smoke create/upload/confirm con cleanup R2 e D1
- smoke asset pubblico e rendering media
```

## Prompt operativo da dare a una AI per il prossimo sito

```text
Leggi gli HTML e CSS esistenti. Non modificare ancora.

Obiettivo: trasformare il sito in un AI CMS via MCP su Cloudflare.

Per ogni blocco visibile:
1. assegna page slug, sectionId, type e styleContract;
2. definisci data shape JSON;
3. definisci editableFields con kind, maxLength e tool;
4. decidi se serve tool specializzato;
5. scrivi test renderer che confrontano classi/stile dello statico;
6. scrivi migration D1;
7. implementa renderer;
8. esponi get_page;
9. implementa update tool;
10. vieta HTML libero, JS, CSS e src arbitrari.

Mantieni il server MCP provider-neutral.
Token tecnico solo read-only.
Token cliente editor per scrittura.
Ogni modifica deve creare section_revisions e change_log.
```

## Principio finale

Il codice resta il luogo della struttura e dello stile. L'AI modifica dati entro contratti.

Questa e' la differenza tra:

- "AI che scrive pagine";
- "AI che amministra un sito".

Il primo approccio rompe facilmente il design. Il secondo crea una maschera stabile, simile a WordPress, ma pensata per agenti: blocchi, campi, tool, revisioni, rollback, auth e renderer.
