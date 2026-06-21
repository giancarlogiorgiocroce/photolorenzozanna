# TODO

## Immagini responsive

- Definire un sistema per generare piu formati per ogni foto: AVIF, WebP, JPG fallback.
- Generare dimensioni diverse per breakpoint mobile, tablet e desktop.
- Usare `srcset` e `sizes` su tutte le immagini editoriali.
- Precaricare solo la hero image della pagina corrente.
- Valutare blur placeholder o dominant color placeholder senza aumentare troppo il CSS.
- Definire naming e dati foto in un file strutturato prima dell'integrazione tecnica.

## Performance

- Misurare Lighthouse mobile appena il mockup viene integrato in un dev server.
- Impostare cache headers lunghi per immagini fingerprinted.
- Evitare librerie JS per animazioni e lightbox finche il codice custom resta semplice.

## Accessibilita

- Testare navigazione tastiera su menu e lightbox.
- Verificare contrasti quando saranno scelte le foto reali.
- Confermare alt text foto per foto, evitando descrizioni generiche.
