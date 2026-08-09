# MCP media pipeline R2

Data: 2026-08-09
Branch operativo: `codex/realign-media`
Stato del codice: pipeline pubblica direct-only; gli identificativi del deploy verificato restano nel resoconto operativo.

Questo documento descrive la pipeline immagini/media del CMS MCP Cloudflare per `ph.lorenzozanna.com`. La checklist unica delle attivita completate e aperte resta `TODO.md`.

## Stato attuale

La pipeline immagini e' attiva in produzione.

Cosa funziona oggi:

- upload diretto e sicuro su R2 tramite file parameter ChatGPT, con asset creato `ready`;
- elenco asset media pronti;
- metadata editoriali ricercabili con `update_media_asset`;
- archiviazione reversibile ed eliminazione fisica sicura con `set_media_asset_archived` e `delete_media_asset`;
- sostituzione immagine esistente con `replace_image`;
- aggiunta immagine a una galleria con `attach_image_to_section`;
- modifica alt text con `update_image_alt`;
- modifica focal point con `set_image_focal_point`;
- nascondere/mostrare una singola immagine gia collegata con `set_image_visibility`;
- rimozione, riordino e caption del singolo uso con `remove_image_from_section`, `reorder_images_in_section` e `update_image_caption`, verificati live con rollback;
- rendering delle immagini da metadata D1;
- servizio pubblico degli asset da R2 tramite `/media/assets/:assetId/:filename`;
- rollback delle sostituzioni immagine tramite `rollback_change`.
Upload diretto live dal deploy `d82fbe3d-565b-4d92-bc71-7e16580ac4e7`:

- `upload_image_file` espone il file parameter ChatGPT e crea direttamente un asset `ready`;
- il download temporaneo usa streaming verso R2, timeout, redirect limitati, blocco host locali/IP e limite 12 MB;
- firma e dimensioni reali vengono estratte per JPEG, PNG, WebP e AVIF; R2 viene ripulito se la scrittura D1 atomica fallisce.


Cosa non e' ancora completo:

- non esiste una UI asset manager tradizionale;
- non ci sono ancora autore e data di scatto editoriali sugli asset;
- non facciamo ancora strip EXIF/GPS lato server;
- non facciamo ancora trasformazioni responsive o thumbnail generate;
- non facciamo scansione malware dedicata;
- la validazione strutturale in produzione non equivale ancora a una decodifica completa dell'immagine;
- resta da verificare il percorso diretto con un allegato ChatGPT reale nel connector del cliente.

## Capacita file corrente di ChatGPT

La specifica OpenAI Plugins corrente permette a ChatGPT di passare un file a un
tool MCP. Il campo file deve essere top-level, deve essere elencato in
`_meta["openai/fileParams"]` e riceve questa shape:

```text
download_url: URL temporaneo, required
file_id: identificatore opaco fornito da ChatGPT, required
mime_type: MIME opzionale
file_name: nome opzionale
```

ChatGPT non inserisce il binario o il base64 nel JSON-RPC: consegna un riferimento
temporaneo autorizzato. Il Worker puo scaricarlo con `fetch()` e passare il
`ReadableStream` a `R2Bucket.put`. Il Worker live implementa questa capacita in
`upload_image_file`; resta da verificarla con un allegato ChatGPT reale.
Il `file_id` non ha una sintassi applicativa da interpretare: il Worker lo tratta
come valore opaco e basa la sicurezza sul `download_url` HTTPS controllato e sui
byte effettivamente scaricati. Un percorso locale come `/mnt/data/...` non e'
invece un URL scaricabile dal Worker e non sostituisce il file parameter.
Riferimenti: [OpenAI file inputs](https://developers.openai.com/plugins/reference#define-file-inputs) e [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).


## Modello dati

Le migration coinvolte sono:

- `edge/migrations/0009_media_assets.sql`;
- `edge/migrations/0010_media_uploads.sql`;
- `edge/migrations/0011_media_asset_metadata.sql`.

Tabelle principali:

- `media_assets`: catalogo asset, metadata pubblici, stato `draft|ready|archived`;
- `media_uploads`: tabella legacy conservata per compatibilita dei dati storici, non alimentata dalla pipeline pubblica;
- `media_usages`: dove un asset viene usato, per pagina/sezione/path.

Un asset pronto ha almeno:

```text
id: asset_<uuid>
r2_key: ph/uploads/<assetId>/<filename>
public_url: media/assets/<assetId>/<filename>
mime_type: image/jpeg|image/png|image/webp|image/avif
status: ready
alt, caption, title, tags, notes, width, height, size_bytes
```

Il nome pubblico resta leggibile per il cliente, ma la chiave fisica contiene `assetId` univoco. Questo evita sovrascritture e permette di ritrovare l'immagine tramite DB.

## Storage e URL pubblici

Storage:

```text
Cloudflare R2 bucket: lorenzozanna-media
Worker binding: env.MEDIA_BUCKET
```

R2 non viene esposto come bucket pubblico generico. Gli asset vengono serviti dal Worker solo se:

1. il path richiesto e' valido;
2. esiste una riga `media_assets` con quel `public_url`;
3. l'asset ha `status = ready`;
4. l'oggetto esiste in R2.

Route pubbliche:

```text
https://api.lorenzozanna.com/media/assets/:assetId/:filename
https://ph.lorenzozanna.com/media/assets/:assetId/:filename
```

La route `ph.lorenzozanna.com/media/assets/*` e' in `edge/wrangler.toml`, per fare arrivare queste richieste al Worker invece che a Pages.

Header risposta asset:

```text
Content-Type: image/png oppure image/jpeg ecc.
Cache-Control: public, max-age=31536000, immutable
Content-Disposition: inline
X-Content-Type-Options: nosniff
```

## Flusso upload attuale in produzione

1. Il cliente allega l'immagine nella chat.
2. ChatGPT associa l'allegato al campo top-level `file` di `upload_image_file`.
3. Il Worker riceve `download_url` temporaneo e `file_id`, scarica lo stream e verifica firma, MIME, dimensioni e limite 12 MB.
4. R2 salva i byte; D1 registra l'asset gia `ready` e l'audit con una scrittura atomica.
5. ChatGPT collega l'asset con `attach_image_to_section` o `replace_image`.

Non esiste un passaggio in cui ChatGPT debba stimare il peso del file, ne una seconda schermata di upload.

## Fallback browser ritirato

La formula `conservare uploadPageUrl esclusivamente come fallback esplicito per client senza file parameter` significava: esporre il vecchio flusso `create_image_upload -> pagina browser -> confirm_image_upload` soltanto quando un client MCP non sa fornire il campo `file`. Non significava usarlo nel normale flusso ChatGPT.

Questa opzione e' stata scartata per la superficie pubblica: due pipeline online rendevano ambiguo il tool da scegliere e il vecchio contratto obbligava il modello a stimare `sizeBytes`, `width` e `height` prima che il browser leggesse il file.

Prima del ritiro il fallback e' stato corretto nel commit `ee1344f`: la pagina invia il file selezionato e il Worker deriva firma, MIME, dimensioni e peso dai byte reali. La versione corretta non e' inclusa nel Worker pubblico. Il kit di ripristino resta soltanto in `.local-only/media-browser-fallback/`, percorso git-ignorato; il codice corretto rimane inoltre recuperabile dalla cronologia Git.


## Dettaglio tecnico: allegato ChatGPT diretto

Il Worker espone `upload_image_file`, separato dai tool di
collegamento per permettere al cliente sia di caricare un'immagine nel catalogo
senza usarla subito, sia di collegarla in un secondo momento.

1. Il tool dichiara un campo top-level `file` conforme alla shape OpenAI e
   `_meta["openai/fileParams"]: ["file"]`.
2. ChatGPT associa l'allegato e passa `download_url`, `file_id` e gli eventuali
   `mime_type`/`file_name`.
3. Il Worker tratta `file_id` come identificatore opaco, senza imporre prefissi o
   alfabeti proprietari.
4. Il Worker accetta soltanto il file parameter marcato dal descriptor, non un
   URL libero inserito nel prompt.
5. Il Worker richiede HTTPS, blocca host locali e IP, applica timeout, massimo 3
   redirect e limite 12 MB, verifica firma/formato e dimensioni reali, quindi
   scrive lo stream in R2.
6. D1 registra asset, metadata, ownership, audit e stato `ready` usando lo stesso
   modello corrente; un errore della scrittura atomica D1 elimina l'oggetto R2.
7. ChatGPT usa `attach_image_to_section` o `replace_image` per il collegamento;
   rollback e `media_usages` restano separati dall'upload del catalogo.

Il Worker pubblico non espone `create_image_upload`, `confirm_image_upload` o
route `/media/uploads/*`.

## Tool MCP media

Tool di lettura:

- `list_media_assets`: lista asset pronti, o filtrati per status se il ruolo lo permette; `query` cerca su titolo, tag, note, alt, caption e filename.

Tool di upload pubblico:

- `upload_image_file`: importa il file parameter in streaming e restituisce direttamente un asset `ready`.

Tool di collegamento:

- `replace_image`: sostituisce un'immagine prevista dal contratto con un asset ready;
- `attach_image_to_section`: aggiunge un asset ready a un array immagini previsto dal contratto;
- `remove_image_from_section`: rimuove un singolo uso da un array contrattualizzato, conserva l'asset nel catalogo e riallinea `media_usages`;
- `reorder_images_in_section`: applica una permutazione completa degli indici correnti e riallinea `media_usages`;
- `update_image_caption`: aggiorna o rimuove la caption del singolo uso senza cambiare i metadata globali dell'asset.

I tool di collegamento sono live, revisionati e reversibili tramite `rollback_change`.

Tool metadata:

- `update_image_alt`: modifica alt text;
- `update_media_asset`: aggiorna o rimuove titolo editoriale, tag e note globali dell'asset con audit in `change_log`;
- `set_media_asset_archived`: archivia un asset `ready` non usato o ripristina un asset `archived`; registra audit e rifiuta l'archiviazione se esistono `media_usages`;
- `delete_media_asset`: elimina definitivamente un asset `archived` senza usi dal namespace R2 del sito e da D1; richiede `confirm: true`, registra audit e rimuove `media_uploads` in cascade;
- `set_image_focal_point`: imposta focal point percentuale 0-100;
- `set_image_visibility`: nasconde o mostra una singola immagine gia collegata, senza rimuoverla dal CMS;
- `update_text` su `items[].images[].enabled`: fallback compatibile per client conservativi.


## Sicurezza

Garanzie gia implementate:

- niente `src` libero nei tool di modifica immagini;
- collegamento solo tramite `assetId` esistente e `ready`;
- MIME dichiarato e `Content-Type` limitati a `image/jpeg`, `image/png`, `image/webp`, `image/avif`;
- nel percorso diretto il MIME effettivo deriva dalla firma JPEG/PNG/WebP/AVIF e le dimensioni sono estratte dall'header;
- il download diretto richiede HTTPS, rifiuta host locali/IP, limita redirect, tempo e byte e non espone un campo URL libero;
- catalogo e audit sono scritti insieme con D1 batch; in caso di errore l'oggetto R2 viene eliminato;
- SVG non consentito;
- dimensione massima upload: 12 MB;
- filename normalizzato e ricostruito in base al MIME;
- asset id generato con UUID;
- nessuna sovrascrittura di oggetti R2;
- route pubblica serve solo asset `ready` presenti in D1;
- `X-Content-Type-Options: nosniff` sugli asset;
- HTML non accettato in alt/caption/testi;
- ogni modifica contenuto registra `section_revisions` e `change_log`;
- token tecnico MCP non puo scrivere contenuti; serve token utente con `content:write`.

Rischi residui o miglioramenti:

- verificare la decodificabilita completa oltre la firma e la struttura dimensionale dell'header;
- aggiungere strip EXIF/GPS prima della pubblicazione;
- valutare antivirus se il sito viene aperto a molti utenti non fidati;
- generare thumbnail e varianti responsive;
- aggiungere quote/rate limit specifici upload;
- valutare autore e data di scatto editoriali se diventano utili al flusso di selezione.

## Rendering

Il renderer non prende path arbitrari dal prompt. Quando una sezione contiene `assetId`, il renderer legge `media_assets` e popola:

- `src` da `public_url`;
- `alt`;
- `caption`;
- `width`;
- `height`;
- focal point se presente nel JSON sezione.

Esempio nel portfolio:

```text
sectionId: gallery
path: items[0].images
assetId: asset_...
publicUrl: media/assets/asset_.../favicon-1.png
```

## Verifiche produzione 2026-07-30

Upload helper storico, ora ritirato:

- commit: `0b8fa21 Add browser media upload helper`;
- deploy: `881bffdd-bcf3-45e4-bd50-63aefe835e8f`;
- smoke: `GET /media/uploads/:uploadId/form` -> `200 text/html`, token non presente nell'HTML.

Chiarimento tool storico, ora ritirato:

- commit: `36e3dff Clarify browser image upload flow`;
- deploy: `df178c8c-305d-4a09-806c-0e941f0363a0`;
- smoke: `tools/list` mostra `upload.uploadPageUrl` nella descrizione di `create_image_upload`.

Servizio pubblico asset R2:

- commit: `e342510 Serve uploaded media assets from R2`;
- deploy: `f1cd4b54-4b60-4448-9937-5ee2d99f2d61`;
- test: `npm test` in `edge` -> 142/142;
- smoke reale: `https://ph.lorenzozanna.com/media/assets/asset_53b5b57f-8e17-499b-a36a-689855a00c4a/favicon-1.png` -> `200 image/png`, `Content-Length: 957538`;
- smoke portfolio: `/portfolio` contiene il path asset e l'alt `Logo con diaframma fotografico arancione su sfondo nero`.
Visibilita singola immagine gallery:

- commit contratto/rendering: `0bb75d0 Allow hiding gallery images via section contract`;
- deploy contratto/rendering: `69d9aa5b-483c-4b27-ac4b-67c8a6d6a8f6`;
- cosa fa: `portfolio.gallery` espone `items[].images[].enabled`; il renderer salta le immagini con `enabled: false`; le cover Home derivate dal portfolio ignorano immagini disabilitate;
- limite emerso da prova plugin: il campo era corretto ma troppo implicito, quindi ChatGPT continuava a dire che non esisteva una funzione per nascondere una foto;
- commit tool esplicito: `fef3c4f Expose explicit image visibility tool`;
- deploy tool esplicito: `22612c5c-79f6-4a5a-867d-83f6f2fc5526`;
- test: `npm test` in `edge` -> 151/151;
- smoke live: `tools/list` su `https://api.lorenzozanna.com/mcp` espone `set_image_visibility`, con `enabled` boolean e descrizione `nascondere/mostrare`.

Ciclo gallery completo:

- commit: `29e2b9e Complete gallery media editing tools`;
- deploy: `2cd8a6b5-6bf3-42c3-b006-1b885adda498`;
- suite pre-deploy: `160/160`;
- smoke `tools/list`: 28 tool live, inclusi `remove_image_from_section`, `reorder_images_in_section` e `update_image_caption`;
- smoke mutante sulla serie `ritratti` con 5 immagini: caption temporanea, scambio degli ultimi due elementi e rimozione dell'ultimo elemento;
- ogni mutazione e' stata annullata subito tramite la propria revisione; D1 e `media_usages` sono tornati esattamente allo stato iniziale;
- smoke finali: health `200`, portfolio `200`, HTML e gallery presenti.

Archiviazione asset reversibile:

- commit: `b838516 Add reversible media asset archiving`;
- deploy: `9efc103f-465f-4994-b326-e427b475dcf5`;
- suite pre-deploy: `170/170`;
- smoke `tools/list`: 30 tool live, incluso `set_media_asset_archived`;
- smoke mutante controllato: l'unico asset live ha un uso, quindi l'archiviazione e' stata rifiutata e lo stato e' rimasto `ready`;
- la credenziale temporanea usata per lo smoke e' stata rimossa.

Cancellazione fisica sicura:

- commit iniziale: `54c1c69 Add safe physical media deletion`;
- correzione cascade D1: `4b3a351 Handle cascaded rows in media deletion`;
- deploy definitivo: `2a3aa4de-5fa8-41ad-b396-386f4b1e39c2`;
- suite pre-deploy: `173/173`;
- smoke `tools/list`: 31 tool live, incluso `delete_media_asset` con `confirm: true`;
- smoke completo: eliminati oggetto R2, asset D1 e sessione `media_uploads` in cascade; audit verificato;
- credenziale, audit e risorse temporanee dello smoke rimossi senza residui.

Upload diretto ChatGPT:

- commit codice: `ec3e3aa Implement direct MCP image uploads`;
- deploy: `d82fbe3d-565b-4d92-bc71-7e16580ac4e7`;
- suite pre-deploy: `185/185`;
- smoke `tools/list`: 32 tool live, `upload_image_file` con file parameter `file`, output `ready` e scope `content:write`;
- smoke read-only: health e MCP `200`, nessun asset di prova creato.

Uso consigliato per il plugin:

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

`set_image_visibility` e' il tool preferito per nascondere/mostrare immagini. `update_text` su `items[...].images[...].enabled` resta disponibile solo come fallback per client conservativi. Se una chat plugin continua a non vedere il tool dopo un deploy, aprire una nuova chat o riconnettere il connector per svuotare la cache degli strumenti.

Rimozione singolo uso disponibile nel plugin live:

```json
{
  "name": "remove_image_from_section",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "gallery",
    "path": "items[0].images[4]"
  }
}
```

La rimozione non archivia ne cancella l'asset. Gli elementi successivi vengono reindicizzati in `media_usages`; `rollback_change` ripristina sia la gallery sia l'indice degli usi.

Riordino completo del gruppo:

```json
{
  "name": "reorder_images_in_section",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "gallery",
    "path": "items[0].images",
    "order": [2, 0, 1]
  }
}
```

Aggiornamento o rimozione didascalia:

```json
{
  "name": "update_image_caption",
  "arguments": {
    "site": "ph",
    "page": "portfolio",
    "sectionId": "gallery",
    "path": "items[0].images[1]",
    "caption": "Ritratto / riflesso"
  }
}
```

Un valore `caption: ""` rimuove la didascalia del singolo uso. La suite locale dopo il completamento del ciclo gallery e' `160/160`.

## Comandi utili


Test locali:

```powershell
cd C:\Users\gianc\Documents\codice\lorenzozanna\edge
npm test
```

Deploy Worker:

```powershell
cd C:\Users\gianc\Documents\codice\lorenzozanna\edge
npx wrangler deploy
```

Smoke asset pubblico:

```powershell
curl.exe -sS -D - https://ph.lorenzozanna.com/media/assets/<assetId>/<filename> -o NUL
```

Smoke tool list:

```powershell
# usare un token valido e POST JSON-RPC tools/list su https://api.lorenzozanna.com/mcp
```

## Prossimi passi consigliati

1. Testare end-to-end `upload_image_file` con un allegato ChatGPT reale e collegare l'asset con attach/replace.
2. Chiudere decodificabilita completa e strip EXIF/GPS nel percorso di ingestione.
3. Aggiungere thumbnail/preview e varianti responsive.
4. Tenere il kit fallback locale aggiornato solo se nasce un requisito concreto per client privi di file parameter.
