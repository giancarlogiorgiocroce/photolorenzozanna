# Contratti sezioni MCP

Data: 2026-07-14

Questo documento mappa il contratto contenutistico e visivo delle sezioni gia presenti nel sito. Serve come base per `get_page`, `update_text`, `update_cta`, `update_rich_text`, preset sezioni e validazione MCP.

## Principi

- Il campo `page_sections.type` resta un tipo logico: `hero`, `text`, `faq`, `cta`, `gallery`.
- Il rendering reale deve usare anche uno `styleContract`, perche sezioni con lo stesso tipo logico possono avere markup/CSS diversi.
- La AI non scrive HTML, classi CSS, attributi o JavaScript.
- La AI modifica solo campi dichiarati nel contratto.
- Il renderer trasforma dati validati in HTML sicuro.
- Ogni modifica salva `before`, `after`, `section_revisions` e `change_log`.

Esempio:

```json
{
  "sectionId": "hero",
  "type": "hero",
  "styleContract": "home.hero",
  "editableFields": ["eyebrow", "title", "intro", "primaryCta", "secondaryCta", "image"]
}
```

## Primitive dati

### `plain_text`

Stringa semplice, escapata sempre dal renderer.

Uso: titoli, kicker, label, caption brevi.

Regole:

- niente HTML;
- trim;
- limite per campo;
- non accetta newline se non dichiarato.

### `text_list`

Array di paragrafi plain text.

Uso: intro, body, paragrafi editoriali.

Regole:

- massimo elementi per campo;
- ogni elemento e `plain_text`;
- renderer produce `<p>...</p>`.

### `rich_text`

Formato strutturato per bold, italic e link senza HTML libero.

Stato 2026-07-14: implementato con tool dedicato `update_rich_text`, validazione server-side e rendering sicuro. Il formato resta provider-neutral: qualunque client AI compatibile MCP puo inviarlo, senza dipendere da ChatGPT, Claude o altri client specifici.

Schema:

```json
{
  "format": "rich_text_v1",
  "blocks": [
    {
      "type": "paragraph",
      "spans": [
        { "text": "Fotografia ", "marks": [] },
        { "text": "sobria", "marks": ["bold"] },
        { "text": " e ", "marks": [] },
        { "text": "pulita", "marks": ["italic"] },
        {
          "text": "guarda il portfolio",
          "marks": [],
          "link": { "href": "/portfolio.html" }
        }
      ]
    }
  ]
}
```

Renderer ammesso:

- `marks: ["bold"]` -> `<strong>`;
- `marks: ["italic"]` -> `<em>`;
- `link.href` valido -> `<a href="...">`.

Regole:

- marks consentiti: `bold`, `italic`;
- link consentiti: URL interni `/...`, relativi allowlisted (`index.html`, `portfolio.html`, `about.html`, `contact.html`), `https://...`, `mailto:...`, `tel:...`;
- link vietati: `javascript:`, `data:`, URL relativi ambigui con `..`;
- niente HTML in `text`;
- niente classi o attributi custom;
- niente nodi annidati arbitrari;
- lunghezza massima per blocco e documento.

Compatibilita:

- i campi esistenti possono restare `plain_text` o `text_list`;
- il renderer accetta sia stringhe/array legacy sia `rich_text_v1` per i campi marcati come rich-text-capable;
- la rimozione di un link si fa sostituendo il valore del campo con span equivalenti senza proprieta `link`.

### `link`

```json
{
  "label": "Guarda il portfolio",
  "href": "/portfolio.html"
}
```

Regole:

- `label`: plain text;
- `href`: interno `/...`, relativo allowlisted `portfolio.html`, `about.html`, `contact.html`, oppure `https://`, `mailto:`, `tel:`;
- no `javascript:`;
- no HTML.

### `image`

```json
{
  "src": "/assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
  "alt": "Ritratto sovrapposto a riflessi di rami",
  "width": 1600,
  "height": 1071
}
```

Regole:

- `src`: per ora solo `/assets/...` o `assets/...`; R2/media pipeline futura aggiungera altri prefissi;
- `alt`: obbligatorio quando l'immagine e informativa, vuoto solo se decorativa e dichiarata dal contratto;
- `width` e `height`: interi positivi;
- niente path esterni finche non esiste media pipeline.

## Contratti comuni

### `common.faq`

Markup/CSS:

- `faq-section`;
- `faq-section__header`;
- `section-kicker`;
- `faq-list`;
- `faq-item`;
- `faq-answer`.

Campi:

```json
{
  "kicker": "FAQ",
  "title": "Domande frequenti",
  "intro": "Risposte pratiche...",
  "items": [
    {
      "question": "Come posso richiedere un ritratto?",
      "answer": "Scrivi dalla pagina Contatti..."
    }
  ]
}
```

Editable:

- `title`: `plain_text`, max 90;
- `intro`: `rich_text`, opzionale, max 260;
- `items[].question`: `plain_text`, max 160;
- `items[].answer`: `rich_text`, max 700.

Tool previsti:

- `update_text` per `title`, `intro` come plain fallback;
- `update_rich_text` per `intro`, `items[].answer`;
- `add_faq_item`;
- `update_faq_item`;
- `remove_faq_item`;
- `reorder_faq_items`.

### `common.cta`

Markup/CSS possibili:

- `cta-section` per CTA piena;
- `section split-section` per CTA editoriale;
- `text-link text-link--accent` per link inline.

Campi:

```json
{
  "kicker": "Contatti",
  "title": "Parliamo del tuo progetto",
  "text": "Scrivi per ritratti, collaborazioni o stampe.",
  "primaryCta": { "label": "Contatti", "href": "/contact.html" }
}
```

Editable:

- `kicker`: `plain_text`, opzionale;
- `title`: `plain_text`, opzionale;
- `text`: `rich_text`;
- `primaryCta`: `link`.

Tool previsti:

- `update_text`;
- `update_cta`;
- `update_rich_text`.

## Contratti home

### `home.hero`

Fonte CSS/HTML:

- `index.html`;
- `assets/css/home.css`;
- classi: `hero`, `hero__media`, `hero__content`, `hero__intro`, `hero__actions`, `text-link`.

Markup target:

```html
<section class="hero">
  <div class="hero__media"><img /></div>
  <div class="hero__content reveal">
    <p class="eyebrow"></p>
    <h1></h1>
    <p class="hero__intro"></p>
    <div class="hero__actions">...</div>
  </div>
</section>
```

Campi:

```json
{
  "eyebrow": "Fotografo a Firenze",
  "title": "Lorenzo Zanna Photography",
  "intro": "Ritratti, natura, strada...",
  "primaryCta": { "label": "Guarda il portfolio", "href": "/portfolio.html" },
  "secondaryCta": { "label": "Contatti", "href": "/contact.html" },
  "image": {
    "src": "/assets/images/portfolio/ritratti/ritratto-neve.jpg",
    "alt": "",
    "width": 1068,
    "height": 1600,
    "decorative": true
  }
}
```

Editable:

- `eyebrow`: `plain_text`, max 60;
- `title`: `plain_text`, max 90;
- `intro`: `rich_text`, max 420;
- `primaryCta`, `secondaryCta`: `link`;
- `image.alt`: `plain_text`, required unless `decorative: true`.

Non editable via testo:

- `hero` layout;
- overlay;
- classi CSS;
- `fetchpriority`.

### `home.selected_work`

Fonte CSS/HTML:

- `index.html`;
- `assets/css/home.css`;
- classi: `section section--intro`, `section__header`, `selected-grid`, `selected-shot`, `selected-shot--wide`.

Campi:

```json
{
  "kicker": "Selezione",
  "title": "Ritratti, natura, strada",
  "intro": "Volti, boschi, passanti...",
  "shots": [
    {
      "caption": "Ritratti",
      "image": "/assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
      "alt": "Ritratto sovrapposto a riflessi di rami",
      "width": 1600,
      "height": 1071,
      "variant": "standard"
    }
  ]
}
```

Editable:

- `kicker`: `plain_text`, max 50;
- `title`: `plain_text`, max 90;
- `intro`: `rich_text`, max 360;
- `shots[].caption`: `plain_text`, max 80;
- `shots[].alt`: `plain_text`, required;
- `shots[].variant`: enum `standard`, `wide`.

Image replacement is future media pipeline, not initial `update_text`.

### `home.split_section`

Fonte CSS/HTML:

- `index.html`;
- `assets/css/home.css`;
- classi: `section split-section`, `split-section__copy`, `split-section__text`, `text-link`.

Campi:

```json
{
  "kicker": "Selezione",
  "title": "Poche immagini, ben scelte.",
  "text": "Il lavoro si muove tra osservazione personale...",
  "cta": { "label": "Scopri l'approccio", "href": "/about.html" }
}
```

Editable:

- `kicker`: `plain_text`;
- `title`: `plain_text`;
- `text`: `rich_text`;
- `cta`: `link`.

## Contratti about

### `about.hero`

Fonte CSS/HTML:

- `about.html`;
- `assets/css/about.css`;
- classi: `about-hero`, `about-hero__image`, `about-hero__copy`.

Campi:

```json
{
  "eyebrow": "Chi sono",
  "title": "Chi è Lorenzo Zanna",
  "intro": "Sono Lorenzo Zanna...",
  "image": {
    "src": "/assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
    "alt": "Ritratto sovrapposto a riflessi di rami",
    "width": 1600,
    "height": 1071
  }
}
```

Editable:

- `eyebrow`: `plain_text`;
- `title`: `plain_text`;
- `intro`: `rich_text`;
- `image.alt`: `plain_text`.

### `about.manifesto`

Fonte CSS/HTML:

- `about.html`;
- `assets/css/about.css`;
- classi: `manifesto`, `manifesto__line`, `manifesto__text`.

Campi:

```json
{
  "kicker": "Sguardo",
  "title": "Uno sguardo sobrio",
  "paragraphs": [
    "Non cerco immagini rumorose..."
  ]
}
```

Editable:

- `kicker`: `plain_text`;
- `title`: `plain_text`;
- `paragraphs`: `rich_text` list.

### `about.values_grid`

Fonte CSS/HTML:

- `about.html`;
- `assets/css/about.css`;
- classi: `values-grid`, `value`.

Campi:

```json
{
  "items": [
    {
      "number": "01",
      "title": "Ritratti",
      "text": "Volti e presenze..."
    }
  ]
}
```

Editable:

- `items[].title`: `plain_text`;
- `items[].text`: `rich_text`;
- `items[].number`: generated from order by default, not AI-editable in v1.

Tool previsti:

- `update_text`;
- future `reorder_items`.

## Contratti contact

### `contact.hero`

Fonte CSS/HTML:

- `contact.html`;
- `assets/css/contact.css`;
- classi: `contact-hero`, `contact-hero__copy`, `contact-hero__image`.

Campi:

```json
{
  "eyebrow": "Contatti",
  "title": "Contatti",
  "intro": "Scrivi per un ritratto...",
  "image": {
    "src": "/assets/images/portfolio/forme/ombre-grata.jpg",
    "alt": "",
    "decorative": true,
    "width": 1600,
    "height": 1200
  }
}
```

Editable:

- `eyebrow`: `plain_text`;
- `title`: `plain_text`;
- `intro`: `rich_text`;
- `image.alt`: `plain_text`, required unless decorative.

### `contact.band`

Fonte CSS/HTML:

- `contact.html`;
- `assets/css/contact.css`;
- classi: `contact-band`, `contact-link`.

Campi:

```json
{
  "channels": [
    {
      "label": "Email",
      "value": "Da definire",
      "href": null
    }
  ]
}
```

Editable:

- `channels[].label`: `plain_text`, max 40;
- `channels[].value`: `plain_text`, max 120;
- `channels[].href`: `link.href`, nullable.

Tool previsti:

- `update_contact_channel`;
- oppure `update_text` con path controllato.

### `contact.availability`

Fonte CSS/HTML:

- `contact.html`;
- `assets/css/contact.css`;
- classi: `availability`, `availability__text`, `availability__list`.

Campi:

```json
{
  "kicker": "Richieste",
  "title": "Come inviare una richiesta utile",
  "items": [
    "Indica se ti interessa un ritratto..."
  ]
}
```

Editable:

- `kicker`: `plain_text`;
- `title`: `plain_text`;
- `items[]`: `plain_text`, list item max 180.

Tool previsti:

- `update_text`;
- future `add_list_item`, `remove_list_item`, `reorder_items`.

## Contratti portfolio

### `portfolio.page_hero`

Fonte CSS/HTML:

- `portfolio.html`;
- `assets/css/base.css`;
- classi: `page-hero`, `page-hero__intro`, `eyebrow`.

Campi:

```json
{
  "eyebrow": "Portfolio",
  "title": "Portfolio fotografico",
  "intro": [
    "Ritratti, strada, natura...",
    "Una selezione breve..."
  ]
}
```

Editable:

- `eyebrow`: `plain_text`;
- `title`: `plain_text`;
- `intro`: `rich_text` list.

### `portfolio.series_text`

Fonte contenuto:

- `content_entries.pages/portfolio.blocks`;
- ora renderizzato come sezione `text_2`.

Fonte CSS target:

- attualmente renderer: `section`;
- statico portfolio usa gallery per serie, non questo blocco testuale;
- contratto accettato in transizione: `editorial-section` o `section`.

Campi:

```json
{
  "title": "Serie",
  "paragraphs": [],
  "subsections": [
    {
      "title": "Ritratti",
      "paragraphs": ["Persone, posture..."]
    }
  ]
}
```

Editable:

- `title`: `plain_text`;
- `paragraphs`: `rich_text` list;
- `subsections[].title`: `plain_text`;
- `subsections[].paragraphs`: `rich_text` list.

### `portfolio.gallery`

Fonte CSS/HTML:

- `portfolio.html`;
- `assets/css/portfolio.css`;
- classi: `portfolio-section`, `portfolio-section__header`, `masonry-gallery`, `masonry-gallery--wide`, `gallery-item`, `gallery-item--wide`, `gallery-item--tall`, `lightbox`.

Campi:

```json
{
  "title": "Portfolio fotografico",
  "intro": "Ritratti, strada...",
  "items": [
    {
      "key": "ritratti",
      "title": "Ritratti",
      "images": [
        {
          "src": "/assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
          "alt": "Ritratto sovrapposto a riflessi di rami",
          "caption": "Ritratti / riflesso",
          "width": 1600,
          "height": 1071
        }
      ]
    }
  ]
}
```

Editable ora:

- `items[].title`: `plain_text`;
- `items[].images[].alt`: `plain_text`;
- `items[].images[].caption`: `plain_text`.

Non editable prima della media pipeline:

- `images[].src`;
- `images[].width`;
- `images[].height`;
- layout `wide/tall`, che resta controllato dal renderer: prima usa eventuale variante esplicita sicura (`standard`, `wide`, `tall`), poi pattern curati per gruppo, e solo come fallback usa le dimensioni.

Nota layout gallery 2026-07-14:

- non derivare sempre `gallery-item--wide` da un rapporto 4:3: in gruppi con molte immagini landscape crea colonne povere e ripetitive;
- `Forme e ombre` usa pattern `standard`, `wide`, `standard`, `standard`, coerente con lo statico locale;
- se si aggiungono/sostituiscono immagini, verificare sempre il pattern visuale della gallery oltre a `width`/`height`.

### `portfolio.faq`

Usa `common.faq`.

Differenza contenutistica:

- `title` statico: "Sul portfolio";
- D1 corrente da `pages/portfolio.blocks`: "FAQ";
- il contratto deve permettere di riallineare il titolo senza cambiare markup.

## Contratti generici di transizione

### `generic.text`

Usato oggi dal renderer per molti blocchi `text`.

Markup corrente:

```html
<section class="section" data-section-type="text">
  <h2>...</h2>
  <p>...</p>
  <h3>...</h3>
  <p>...</p>
</section>
```

Campi:

```json
{
  "title": "Titolo",
  "paragraphs": ["Paragrafo"],
  "subsections": [
    {
      "title": "Sottotitolo",
      "paragraphs": ["Paragrafo"]
    }
  ]
}
```

Editable:

- `title`: `plain_text`;
- `paragraphs`: `rich_text` list;
- `subsections[].title`: `plain_text`;
- `subsections[].paragraphs`: `rich_text` list.

Uso:

- fallback sicuro finche il renderer non ha contratti specifici per tutte le sezioni.

## Risoluzione contratto

Ordine consigliato:

1. contratto specifico `page.slug + section.section_key`;
2. contratto specifico `page.slug + section.type`;
3. contratto comune per `section.type`;
4. fallback `generic.text` solo per lettura, non per nuove sezioni.

Esempio:

```text
home/hero       -> home.hero
chi-sono/hero   -> about.hero
contatti/hero   -> contact.hero
portfolio/hero  -> portfolio.page_hero
portfolio/gallery -> portfolio.gallery
*/faq           -> common.faq
*/cta           -> common.cta
```

## Output `get_page`

`get_page` deve restituire i contratti in modo leggibile dalla AI:

```json
{
  "site": "ph",
  "page": "portfolio",
  "sections": [
    {
      "sectionId": "hero",
      "type": "hero",
      "styleContract": "portfolio.page_hero",
      "enabled": true,
      "order": 10,
      "editableFields": [
        {
          "path": "title",
          "kind": "plain_text",
          "maxLength": 90
        },
        {
          "path": "intro",
          "kind": "rich_text",
          "maxLength": 700,
          "plainTextTool": "update_text",
          "richTextTool": "update_rich_text"
        }
      ]
    }
  ]
}
```

## Sequenza tool consigliata

1. `get_page`
   - legge sezioni;
   - risolve `styleContract`;
   - espone campi editabili;
   - non modifica nulla.

2. `enable_section`
   - simmetrico a `disable_section`;
   - revision e log.

3. `update_text`
   - solo `plain_text` e `text_list`;
   - per campi `rich_text`, aggiorna temporaneamente plain text legacy solo se il contratto lo consente.
   - Stato 2026-07-14: implementato come tool MCP sicuro con path controllati, max length da contratto, blocco HTML e revision/change log.

4. `update_cta`
   - aggiorna `link`;
   - valida URL.
   - Stato 2026-07-14: implementato con validazione path da contratto, label plain text, href allowlisted, revision e change log.

5. `update_rich_text`
   - abilita `marks[]`, link e renderer rich text.
   - Stato 2026-07-14: implementato con `rich_text_v1`, supporto `bold`, `italic`, link sicuri, rimozione link via replace, blocco HTML/script/URL pericolosi, revision e change log.

6. `list_changes`
   - legge `change_log` senza modificare contenuti;
   - richiede `content:read`;
   - filtra per `page`, `sectionId` e `limit`;
   - restituisce target normalizzato (`page`, `sectionId`, `path`) piu `before`/`after` parsati.
   - Stato 2026-07-14: implementato come tool MCP provider-neutral, utile come base per `rollback_change`.

7. `rollback_change`
   - ripristina lo snapshot `before` di un cambio o di una revisione strutturata;
   - richiede `content:write`;
   - accetta `changeId`, `revisionId` oppure `page`/`sectionId` per ultimo cambio filtrato;
   - registra a sua volta una nuova `section_revisions` e una nuova riga `change_log`;
   - blocca rollback stale quando lo stato corrente non coincide con lo snapshot `after` della modifica da annullare.
   - Stato 2026-07-14: implementato e coperto da test per testo, visibility, ultimo cambio, revisione specifica e guardia stale.

8. Tool itemizzati
   - FAQ item;
   - list item;
   - gallery caption/alt;
   - contact channel.

## Decisione su bold, italic e link

Non li rimandiamo come design: entrano nel contratto con `rich_text_v1`.

Stato 2026-07-14: anche il tool operativo e attivo. La sequenza e stata: prima lettura e modifiche plain text, poi `update_cta`, poi `update_rich_text`. In questo modo:

- l'architettura non si chiude in un modello solo plain text;
- il primo set di tool resta piccolo e sicuro;
- bold/italic/link hanno un renderer e una validazione gia vincolati a un formato deciso.

## Nota regressione renderer 2026-07-14

Il renderer pubblico deve risolvere e rispettare lo `styleContract`, non solo il `type` logico. Una sezione `hero` puo richiedere markup molto diverso tra home, about, contact e portfolio. Dopo l'incidente su `ph.lorenzozanna.com`, i test devono coprire almeno:

- classi visuali specialistiche (`hero__media`, `selected-grid`, `about-hero__image`, `values-grid`, `contact-band`, `page-hero__intro`);
- fallback statici per immagini e link gia presenti nel sito;
- assenza di CTA generiche non previste dallo statico;
- continuita dei tool MCP (`get_page`, `update_text`) sui dati D1 reali, inclusi path transitori come `subsections[]`.

Nota parita statico/dinamico 2026-07-14:

- gli HTML statici locali sono reference visuale/SEO, non sorgente del live HTML;
- ogni blocco dinamico deve avere markup/CSS equivalente al contratto statico preferito;
- `portfolio/text_2` deve usare `portfolio.series_text` e markup `editorial-section`, non il fallback generico `<section class="section">`;
- se cambia `assets/css`, aggiornare anche lo staging Pages `.deploy/ph/assets/css` prima del deploy statico;
- i meta description/OG presenti negli statici devono essere replicati dal renderer dinamico quando la pagina e servita dal Worker.
