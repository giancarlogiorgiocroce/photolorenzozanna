# MCP media pipeline R2

Data: 2026-07-30
Branch operativo: `codex/upload-helper`
Worker corrente deployato: `f1cd4b54-4b60-4448-9937-5ee2d99f2d61`

Questo documento descrive la pipeline immagini/media del CMS MCP Cloudflare per `ph.lorenzozanna.com`.

## Stato attuale

La pipeline immagini e' attiva in produzione.

Cosa funziona oggi:

- upload sicuro su R2 tramite sessione temporanea;
- fallback browser `uploadPageUrl` per i client che non possono inviare byte binari;
- conferma upload e promozione asset da `draft` a `ready`;
- elenco asset media pronti;
- sostituzione immagine esistente con `replace_image`;
- aggiunta immagine a una galleria con `attach_image_to_section`;
- modifica alt text con `update_image_alt`;
- modifica focal point con `set_image_focal_point`;
- rendering delle immagini da metadata D1;
- servizio pubblico degli asset da R2 tramite `/media/assets/:assetId/:filename`;
- rollback delle sostituzioni immagine tramite `rollback_change`.

Cosa non e' ancora completo:

- ChatGPT non passa automaticamente i byte dell'immagine allegata al tool MCP, se il client non espone questa capacita;
- non esiste ancora un tool unico `upload_and_attach_image` con file diretto;
- non esiste una UI asset manager tradizionale;
- non ci sono ancora titolo/tags/search avanzata sugli asset;
- non c'e' ancora `remove_image_from_section`;
- non c'e' ancora delete/archive asset con controllo degli usi;
- non facciamo ancora strip EXIF/GPS lato server;
- non facciamo ancora trasformazioni responsive o thumbnail generate;
- non facciamo scansione malware dedicata.

## Modello dati

Le migration coinvolte sono:

- `edge/migrations/0009_media_assets.sql`;
- `edge/migrations/0010_media_uploads.sql`.

Tabelle principali:

- `media_assets`: catalogo asset, metadata pubblici, stato `draft|ready|archived`;
- `media_uploads`: sessioni upload temporanee, token salvato solo come hash;
- `media_usages`: dove un asset viene usato, per pagina/sezione/path.

Un asset pronto ha almeno:

```text
id: asset_<uuid>
r2_key: ph/uploads/<assetId>/<filename>
public_url: media/assets/<assetId>/<filename>
mime_type: image/jpeg|image/png|image/webp|image/avif
status: ready
alt, caption, width, height, size_bytes
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

## Flusso upload completo

Flusso tecnico standard:

1. Il client chiama `create_image_upload` con `site`, `filename`, `mimeType`, `sizeBytes`, `width`, `height`, `alt` e opzionalmente `caption`.
2. Il server crea un asset `draft` e una sessione `pending`.
3. Il server restituisce `upload.id`, `upload.uploadUrl`, `upload.uploadToken`, `upload.uploadPageUrl`, `upload.r2Key` e `asset.id`.
4. Il file viene caricato con `PUT /media/uploads/:uploadId` e header `Authorization: Bearer <uploadToken>`.
5. Il client chiama `confirm_image_upload` con `upload.id`.
6. Il server verifica R2 con `MEDIA_BUCKET.head`, controlla dimensione/MIME e promuove l'asset a `ready`.
7. Il client collega l'asset con `attach_image_to_section` oppure `replace_image`.

## Flusso ChatGPT con pagina browser

Questo e' il flusso attuale per ChatGPT quando il connector vede l'immagine allegata ma non puo inviare byte binari al nostro endpoint.

1. ChatGPT deve chiamare comunque `create_image_upload`.
2. ChatGPT deve mostrare all'utente `upload.uploadPageUrl`.
3. L'utente apre il link nel browser.
4. La pagina legge il token dal fragment URL `#token=...`, quindi il token non viene inviato nella richiesta `GET` e non viene scritto nell'HTML.
5. L'utente seleziona il JPG/PNG/WebP/AVIF.
6. La pagina esegue il `PUT` binario verso `/media/uploads/:uploadId`.
7. L'utente torna in ChatGPT e scrive che l'upload e' completato.
8. ChatGPT chiama `confirm_image_upload`.
9. ChatGPT chiama `attach_image_to_section` o `replace_image`.

Prompt consigliato per forzare il flusso corretto:

```text
Chiama create_image_upload anche se non puoi caricare direttamente il file.
Mostrami upload.uploadPageUrl.
Dopo che carico l'immagine dal browser, chiama confirm_image_upload e poi attach_image_to_section.
```

## Tool MCP media

Tool di lettura:

- `list_media_assets`: lista asset pronti, o filtrati per status se il ruolo lo permette.

Tool di upload:

- `create_image_upload`: crea asset draft e sessione pending;
- `confirm_image_upload`: promuove l'asset a ready dopo verifica R2.

Tool di collegamento:

- `replace_image`: sostituisce un'immagine prevista dal contratto con un asset ready;
- `attach_image_to_section`: aggiunge un asset ready a un array immagini previsto dal contratto.

Tool metadata:

- `update_image_alt`: modifica alt text;
- `set_image_focal_point`: imposta focal point percentuale 0-100.

Tool non ancora implementati:

- `remove_image_from_section`;
- `archive_media_asset` oppure `delete_media_asset`;
- `update_media_asset` con titolo/tags/nome leggibile;
- `upload_and_attach_image` se il client puo passare file/base64/URL.

## Sicurezza

Garanzie gia implementate:

- niente `src` libero nei tool di modifica immagini;
- collegamento solo tramite `assetId` esistente e `ready`;
- MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/avif`;
- SVG non consentito;
- dimensione massima upload: 12 MB;
- filename normalizzato e ricostruito in base al MIME;
- asset id e upload id generati con UUID;
- nessuna sovrascrittura di oggetti R2;
- token upload usa-e-getta, breve e salvato solo come hash;
- scadenza upload: 15 minuti;
- pubblicazione asset solo dopo `confirm_image_upload`;
- route pubblica serve solo asset `ready` presenti in D1;
- `X-Content-Type-Options: nosniff` sugli asset;
- HTML non accettato in alt/caption/testi;
- ogni modifica contenuto registra `section_revisions` e `change_log`;
- token tecnico MCP non puo scrivere contenuti; serve token utente con `content:write`.

Rischi residui o miglioramenti:

- aggiungere strip EXIF/GPS prima della pubblicazione;
- valutare antivirus se il sito viene aperto a molti utenti non fidati;
- generare thumbnail e varianti responsive;
- aggiungere quote/rate limit specifici upload;
- aggiungere archiviazione o cancellazione sicura asset con controllo `media_usages`;
- aggiungere audit piu umano per asset: titolo, tags, note, autore, data scatto.

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

Upload helper:

- commit: `0b8fa21 Add browser media upload helper`;
- deploy: `881bffdd-bcf3-45e4-bd50-63aefe835e8f`;
- smoke: `GET /media/uploads/:uploadId/form` -> `200 text/html`, token non presente nell'HTML.

Chiarimento tool per ChatGPT:

- commit: `36e3dff Clarify browser image upload flow`;
- deploy: `df178c8c-305d-4a09-806c-0e941f0363a0`;
- smoke: `tools/list` mostra `upload.uploadPageUrl` nella descrizione di `create_image_upload`.

Servizio pubblico asset R2:

- commit: `e342510 Serve uploaded media assets from R2`;
- deploy: `f1cd4b54-4b60-4448-9937-5ee2d99f2d61`;
- test: `npm test` in `edge` -> 142/142;
- smoke reale: `https://ph.lorenzozanna.com/media/assets/asset_53b5b57f-8e17-499b-a36a-689855a00c4a/favicon-1.png` -> `200 image/png`, `Content-Length: 957538`;
- smoke portfolio: `/portfolio` contiene il path asset e l'alt `Logo con diaframma fotografico arancione su sfondo nero`.

## Comandi utili

Test locali:

```powershell
cd C:\tmp\lorenzozanna-upload-helper\edge
npm test
```

Deploy Worker:

```powershell
cd C:\tmp\lorenzozanna-upload-helper\edge
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

1. Aggiungere metadata asset manager: titolo leggibile, tags, note, autore/data, ricerca.
2. Aggiungere `remove_image_from_section` con rollback e aggiornamento `media_usages`.
3. Aggiungere archive/delete asset con blocco se l'asset e' ancora usato.
4. Aggiungere strip EXIF/GPS e thumbnail server-side.
5. Valutare `upload_and_attach_image` solo se il client MCP puo passare file/base64/URL temporaneo in modo affidabile.