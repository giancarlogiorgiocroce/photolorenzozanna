# Recap per prossima chat - photolorenzozanna

Data ultimo recap: 2026-07-04
Cartella locale progetto: `C:\Users\gianc\Documents\codice\lorenzozanna`
Repository GitHub: `https://github.com/giancarlogiorgiocroce/photolorenzozanna.git`
GitHub Pages previsto: `https://giancarlogiorgiocroce.github.io/photolorenzozanna/`

## Nota interna 2026-07-14 - Parita statico/dinamico

Il sito live `https://ph.lorenzozanna.com` e servito dal Worker dinamico per le route HTML principali (`/`, `/index.html`, `/portfolio`, `/portfolio.html`, `/about`, `/about.html`, `/contact`, `/contact.html`). Cloudflare Pages resta sorgente degli asset statici (`assets/css`, `assets/js`, immagini).

Regola per le prossime chat: gli HTML statici locali in root restano reference visuale/SEO, ma non sono la sorgente del live HTML. Quando si cambia una struttura visiva, bisogna equiparare:

- renderer Worker in `edge/src/rendering.mjs`;
- contratti in `edge/src/page-contracts.mjs` e `MCP_SECTION_CONTRACTS.md`;
- CSS sorgente in `assets/css/`;
- staging Pages in `.deploy/ph/assets/css/` se cambia un asset;
- test in `edge/test/rendering.test.mjs`.

Fix gia fatto il 2026-07-14: `portfolio/text_2` non deve piu renderizzare come `<section class="section">`; usa `styleContract = portfolio.series_text` e markup `editorial-section`/`editorial-section__item`. Anche i meta description/OG del dinamico sono stati riallineati agli statici locali.

## Obiettivo del progetto

Creare un sito fotografico personale per Lorenzo Zanna, da usare come landing page collegata a un biglietto da visita/QR code.

Il sito deve presentare foto semi-professionali in modo elegante, scuro, minimale e moderno. Deve servire soprattutto come prima impressione visiva: poche parole, immagini centrali, contatto semplice.

## Riferimento iniziale

Sito analizzato: `https://www.robertfischerphoto.com/`

Lettura condivisa:

- Da prendere: tono fotografico, scuro, minimale, poco commerciale.
- Da non copiare: struttura tecnica vecchia, Adobe Muse 2017, SEO debole, nessun heading semantico, script legacy, esperienza datata.
- Il mood corretto e': serio, autoriale, sobrio, personale.

## Decisioni di design

### Direzione principale

- Sfondo scuro stile Fischer.
- Testi chiari ma non troppo protagonisti.
- Immagini molto centrali.
- Parole ridotte a orientamento, non a racconto dominante.
- Menu minimale: `Lorenzo Zanna` + `Portfolio`, `About`, `Contact`.

### Direzione scelta dal cliente

Il cliente ha scelto la versione B Classic. La Classic e' ora pubblicata nella root del sito, mentre la precedente Idea A Image-first e' stata archiviata in `archive/image-first/`.

## Versioni attualmente presenti

### Default - Classic

Percorso locale:

- `index.html`
- `portfolio.html`
- `about.html`
- `contact.html`
- `assets/`

URL locale se server attivo:

- `http://127.0.0.1:4173/index.html`

Caratteristiche:

- Home con hero fotografico e testo iniziale piu presente.
- Direzione scura, elegante, sobria e classica.
- Portfolio con intro testuale e sezioni editoriali.
- Bottone di confronto `Idea A / Idea B` rimosso dalla UX pubblica.

### Archivio - Idea A Image-first

Percorso locale:

- `archive/image-first/`

URL locale se server attivo:

- `http://127.0.0.1:4173/archive/image-first/index.html`

Caratteristiche:

- Home senza grande scritta iniziale.
- H1 presente solo per SEO/accessibilita, nascosto visualmente.
- Primo viewport composto da immagini.
- Conservata solo come archivio grafico, non come scelta attiva.

## Tipografia

Referenza visiva analizzata: immagine stile `zaga fotografia, Firenze`.

Mood font:

- Serif elegante ad alto contrasto, stile Didone/Bodoni.
- Possibili font: `Bodoni Moda`, `Libre Bodoni`, `Didot`, `Bodoni 72`, `Playfair Display`.

Direzione consigliata per il progetto:

```css
--font-logo: "Cormorant Garamond", serif;
--font-serif: "Libre Baskerville", Georgia, serif;
--font-ui: "Inter", system-ui, sans-serif;
```

Nota: la tipografia deve restare raffinata ma non troppo boutique/wedding. Le immagini devono comandare.

## Palette colori

Palette estratta da una foto con mood freddo/analogico:

```css
--color-bg: #d7e4e1;
--color-surface: #a9c9c8;
--color-muted: #6f9291;
--color-ink: #16080a;
--color-ink-soft: #283a3d;
--color-accent: #c94d1c;
--color-accent-deep: #5a0a0b;
--color-warm: #b9683e;
```

Decisione presa:

- Questa palette e' piano di riserva.
- Il piano principale resta sfondo scuro.
- Alcuni colori della palette servono solo come accenti.

Token principali attuali:

```css
--color-bg: #0f1010;
--color-bg-soft: #171a1a;
--color-surface: #202525;
--color-text: #f1eee8;
--color-text-muted: #b8b2aa;
--color-text-subtle: #7f8784;
--color-accent: #c94d1c;
--color-accent-deep: #5a0a0b;
--color-accent-cool: #6f9291;
```

## Struttura file importante

Root progetto:

- `index.html` - home Classic scelta dal cliente.
- `portfolio.html` - portfolio Classic.
- `about.html` - about.
- `contact.html` - contatti.
- `assets/css/base.css` - stile globale, header, nav, token, animazioni comuni.
- `assets/css/home.css` - layout home Classic.
- `assets/css/portfolio.css` - layout portfolio e lightbox.
- `assets/css/about.css` - layout about.
- `assets/css/contact.css` - layout contact.
- `assets/js/main.js` - menu mobile, header scroll, reveal animation.
- `assets/js/gallery.js` - lightbox solo portfolio.
- `archive/image-first/` - archivio grafico della precedente Idea A.
- `concept-classic/` - copia storica della Classic, non linkata.
- `TODO.md` - note future su immagini responsive, performance, accessibilita.

Cartelle locali ignorate da Git:

- `.codex-audit/` - note strategiche precedenti.
- `.site-backups/` - backup locali.
- `NEXT_CHAT_RECAP.md` - questo file, solo per passaggio contesto.

## Note strategiche salvate in `.codex-audit/`

Sono state create note locali con:

- overview del riferimento Fischer;
- valutazione grafica/UX;
- valutazione sviluppatore web;
- SEO/GEO/accessibilita/sicurezza;
- direzione prodotto;
- referenze tipografiche;
- palette colori.

Questa cartella e' ignorata e non va pubblicata.

## Performance e vincoli tecnici gia considerati

- Sito per ora statico HTML/CSS/JS.
- CSS diviso: globale + CSS per pagina.
- `gallery.js` caricato solo nel portfolio.
- Immagini Picsum come placeholder, non blocchi grigi.
- `loading="lazy"` usato sulle immagini non above-the-fold.
- Immagini principali above-the-fold con `fetchpriority="high"` o senza lazy.
- TODO gia inserito per sistema futuro di responsive images con `srcset`, `sizes`, WebP/AVIF e varianti per breakpoint.

## Git e pubblicazione

E' stato fatto un commit e push del mockup statico:

- Commit: `dcd9eb7 Add static website mockup`
- Branch: `main`

Il sito dovrebbe essere pubblicabile con GitHub Pages da:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ root`

URL atteso:

- `https://giancarlogiorgiocroce.github.io/photolorenzozanna/`

Se GitHub Pages mostra 404, controllare:

1. Che `index.html` sia su `main` nella root.
2. Che Pages punti a `main / root`.
3. Che siano passati alcuni minuti dal push.

## Stato desiderato prossimo

Il prossimo lavoro dovrebbe partire da:

- usare la Classic in root come base definitiva;
- sostituire Picsum con immagini reali;
- rifinire home e portfolio in base alle proporzioni reali delle immagini;
- convertire il mockup statico in progetto tecnico vero, probabilmente Astro;
- creare pipeline immagini responsive.

Priorita prossima consigliata:

1. Inserire prime foto reali.
2. Rifinire home e portfolio in base alle proporzioni reali delle immagini.
3. Confermare testi e dati contatto reali.
4. Solo dopo migrare a stack tecnico vero.
