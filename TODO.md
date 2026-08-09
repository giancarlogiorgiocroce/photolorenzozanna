# TODO unico del progetto

Aggiornato: 2026-08-09

Questo e' l'unico registro operativo dei TODO di `ph.lorenzozanna.com` e del relativo AI CMS via MCP. I precedenti registri e roadmap sono conservati in `archive/docs/` solo come cronologia.

Legenda:

- `[x]` completato e verificato tramite codice, test, cronologia Codex o controllo live;
- `[ ]` ancora da fare o da verificare esplicitamente;
- le alternative scartate non restano come falsi TODO aperti: la decisione adottata e' registrata come completata.

Fonti confrontate: documentazione attiva e storica del progetto, task Codex precedenti associate alla cartella, codice e test locali, cronologia Git e smoke test documentati. Le copie dentro `.site-backups/`, `.codex-audit/` e `archive/` sono fonti storiche, non registri operativi.

## Ordine corrente delle priorita

Le checklist dettagliate restano nelle sezioni sotto; questo e' solo l'ordine consigliato per il lavoro nuovo, senza duplicare le spunte:

1. verificare con un allegato ChatGPT reale il nuovo `upload_image_file` live, senza passaggi browser esterni;
2. chiudere decodificabilita completa, strip EXIF/GPS e hardening del file reale;
3. completare l'asset manager con thumbnail, preview e varianti responsive;
4. chiudere gli altri test MCP/client, performance, accessibilita e SEO strutturata.

## 1. Centralizzazione e stato

- [x] Leggere tutti i file Markdown del progetto, inclusi audit, recap, roadmap, contratti e README.
- [x] Leggere tutte le task Codex precedenti associate alla cartella `lorenzozanna`.
- [x] Confrontare le spunte storiche con il codice effettivamente mantenuto.
- [x] Confrontare le spunte storiche con la suite locale completa: `185/185` test verdi al 2026-08-02.
- [x] Verificare live le quattro route pubbliche principali: `/`, `/portfolio`, `/about`, `/contact` rispondono `200`.
- [x] Verificare live `robots.txt`, `sitemap.xml` e redirect canonico di `/index.html`.
- [x] Verificare lo storico deploy diretto: 32 tool MCP erano esposti quando convivevano `upload_image_file` e il fallback browser.
- [x] Verificare live `set_media_asset_archived`: l'asset referenziato una volta viene rifiutato e resta `ready`; credenziale temporanea rimossa.
- [x] Archiviare i registri TODO e le roadmap duplicate in `archive/docs/`, mantenendo solo questo file come checklist attiva.
- [x] Mantenere gli snapshot in `.site-backups/` come archivio non operativo.
- [x] Aggiornare `MCP_AI_CMS_TEMPLATE_MANUAL.md` allo stato media/R2 attuale.
- [x] Versionare `MCP_AI_CMS_TEMPLATE_MANUAL.md` insieme alla documentazione tecnica.

## 2. Sito pubblico e contenuti

- [x] Rendere la versione B Classic la versione pubblica predefinita.
- [x] Archiviare la precedente versione Image-first in `archive/image-first/`.
- [x] Mantenere pubbliche solo Home, Chi sono, Portfolio e Contatti.
- [x] Mantenere Servizi, Ritratti, Fotografia commerciale, Stampe analogiche, Metodo e FAQ come contenuti draft/non pubblici.
- [x] Mantenere Piano SEO come documento interno e non come pagina pubblica.
- [x] Riscrivere il copy visibile delle quattro pagine con tono fotografico e non meta/SEO-artificiale.
- [x] Sincronizzare le quattro pagine pubbliche e i draft in D1 tramite MCP.
- [x] Sostituire i placeholder con 20 fotografie reali ottimizzate.
- [x] Organizzare il portfolio reale in Ritratti, Strada, Natura e Forme e ombre.
- [x] Integrare FAQ riusabili nelle quattro pagine pubbliche.
- [x] Allineare lo stile delle FAQ al resto del sito.
- [x] Rendere il blocco contatti una sezione D1 autonoma e modificabile.
- [x] Configurare l'email pubblica `zannafotografia@icloud.com`.
- [x] Derivare automaticamente link `mailto:` e `tel:` dai recapiti validi.
- [ ] Sostituire il numero di test `123123123` con il numero definitivo oppure nascondere il canale telefono.
- [ ] Confermare il valore definitivo di Instagram e decidere se mostrarlo.
- [x] Non introdurre nuove pagine pubbliche senza una decisione esplicita.

## 3. Fondazione Cloudflare e deploy

- [x] Creare e configurare l'account Cloudflare del progetto.
- [x] Delegare i nameserver di `lorenzozanna.com` da Aruba a Cloudflare.
- [x] Attivare la zona DNS Cloudflare.
- [x] Creare il database D1 `lorenzozanna_content`.
- [x] Creare e deployare il Worker `lorenzozanna-edge`.
- [x] Pubblicare l'API su `https://api.lorenzozanna.com`.
- [x] Pubblicare il frontend e gli asset su Cloudflare Pages.
- [x] Collegare `ph.lorenzozanna.com` al frontend pubblico.
- [x] Usare un unico Worker per API, MCP e rendering HTML dinamico.
- [x] Usare `https://api.lorenzozanna.com/mcp` come endpoint MCP corrente.
- [x] Non creare `mcp.lorenzozanna.com` nella fase corrente, per evitare DNS e route non necessari.
- [x] Servire gli asset statici da Pages e l'HTML dinamico dal Worker.
- [x] Configurare `Cache-Control: no-store` per l'HTML dinamico.
- [x] Mantenere l'API pubblica storica compatibile con `mcp/call-tool.mjs`.
- [x] Attivare R2 sull'account Cloudflare.
- [x] Creare il bucket privato `lorenzozanna-media`.
- [x] Configurare il binding Worker `MEDIA_BUCKET`.

## 4. Test e vertical slice TDD

- [x] Scegliere `node:test` come test runner senza dipendenze esterne.
- [x] Aggiungere lo script `npm test` in `edge/package.json`.
- [x] Testare `GET /api/health`.
- [x] Testare la public API con soli contenuti published.
- [x] Testare il rifiuto delle API private senza bearer token valido.
- [x] Testare upsert privato draft.
- [x] Testare upsert privato published.
- [x] Testare la scrittura nel change log per gli upsert.
- [x] Testare che i contenuti interni/draft non escano dalla public API.
- [x] Scrivere lo scenario end-to-end `disable_section -> D1 -> HTML senza FAQ`.
- [x] Scegliere `disable_section` come nome del primo tool MCP.
- [x] Definire input strutturato `site`, `page`, `sectionId` per `disable_section`.
- [x] Definire output strutturato con stato, revisione, URL e pubblicazione.
- [x] Eseguire la vertical slice locale completa.
- [x] Eseguire uno smoke remoto controllato della vertical slice.
- [x] Verificare che ogni modifica della vertical slice sia loggata.
- [x] Verificare il rollback della vertical slice.

## 5. Modello dati D1 e migrazioni

- [x] Creare lo schema iniziale `sites`, `content_entries` e `change_log`.
- [x] Creare `pages`.
- [x] Creare `page_sections` con chiave, tipo, ordine, enabled e data JSON.
- [x] Creare `section_revisions`.
- [x] Migrare in modo additivo i contenuti legacy verso pagine e sezioni.
- [x] Mantenere `content_entries` durante la transizione.
- [x] Seedare Home da contenuti reali.
- [x] Seedare Chi sono da contenuti reali.
- [x] Seedare Portfolio da contenuti reali.
- [x] Seedare Contatti da contenuti reali.
- [x] Seedare la gallery Portfolio senza mutare i dati legacy.
- [x] Seedare `contact-band` come sezione autonoma.
- [x] Creare `auth_tokens` con token hashati e revocabili.
- [x] Creare le tabelle OAuth per authorization code e access token hashati.
- [x] Creare `media_assets`.
- [x] Creare `media_usages`.
- [x] Creare le sessioni `media_uploads` con upload token hashati.
- [x] Applicare tutte le migrazioni `0001`-`0010` in locale.
- [x] Applicare tutte le migrazioni necessarie sul D1 remoto.
- [x] Documentare un rollback plan additivo che preserva `content_entries`.
- [x] Testare ordinamento e shape delle sezioni nel renderer e nelle migration.

## 6. Rendering dinamico e parita' visuale

- [x] Servire `ph.lorenzozanna.com` tramite Worker dinamico per le route HTML.
- [x] Mappare `/` e `/index.html` alla Home.
- [x] Mappare `/portfolio` e `/portfolio.html` al Portfolio.
- [x] Mappare `/about` e `/about.html` a Chi sono.
- [x] Mappare `/contact` e `/contact.html` a Contatti.
- [x] Rendere solo sezioni published ed enabled.
- [x] Rispettare `section_order`.
- [x] Risolvere `styleContract` specifici invece del solo `type` logico.
- [x] Rendere `portfolio/text_2` con markup `editorial-section`.
- [x] Rendere la gallery Portfolio da D1.
- [x] Rendere FAQ dinamiche.
- [x] Rendere il contact band dinamico.
- [x] Rendere immagini statiche e media asset tramite metadata.
- [x] Mantenere CSS, JS, immagini e lightbox esistenti.
- [x] Allineare meta description e Open Graph tra statico e dinamico.
- [x] Verificare che una modifica D1 sia visibile al refresh senza redeploy.
- [x] Verificare che le route HTML non servano piu' il vecchio statico.
- [x] Conservare gli HTML root come reference visuale/SEO, non come sorgente live.

## 7. Protocollo MCP remoto

- [x] Conservare l'MCP locale stdio per compatibilita' e strumenti storici.
- [x] Esporre MCP remoto HTTP su `/mcp`.
- [x] Implementare `initialize`.
- [x] Implementare `tools/list`.
- [x] Implementare `tools/call`.
- [x] Richiedere autenticazione alle chiamate MCP.
- [x] Restituire `structuredContent` nei risultati tool.
- [x] Mantenere il server provider-neutral.
- [x] Pubblicare protocol version `2025-06-18` in `initialize`.
- [ ] Aggiungere un test dedicato alla gestione dell'header `MCP-Protocol-Version`.
- [ ] Aggiungere un test dedicato all'header `Accept: application/json, text/event-stream`.
- [ ] Decidere e documentare se supportare SSE oppure solo risposte JSON.
- [ ] Standardizzare e testare gli errori MCP/JSON-RPC per tutti i tool.
- [ ] Rifiutare esplicitamente `disable_section` quando la sezione e' gia' disabilitata.

## 8. Auth, ruoli e OAuth

- [x] Separare token tecnico e token utente.
- [x] Limitare `AI_API_TOKEN` a `content:read` sul canale MCP.
- [x] Richiedere token utente per `content:write`.
- [x] Associare i token utente al sito `ph`.
- [x] Salvare solo hash dei token in D1.
- [x] Supportare revoca dei token personali.
- [x] Definire ruolo `owner`.
- [x] Definire ruolo `editor`.
- [x] Definire ruolo `publisher`.
- [x] Definire ruolo `viewer`.
- [x] Testare token mancante.
- [x] Testare token invalido.
- [x] Testare token revocato.
- [x] Testare permesso lettura.
- [x] Testare permesso scrittura.
- [x] Testare il rifiuto di write con token tecnico.
- [x] Loggare l'actor utente reale nelle modifiche.
- [x] Provisionare il token personale Lorenzo editor.
- [x] Pubblicare protected resource metadata OAuth/MCP.
- [x] Pubblicare authorization server metadata.
- [x] Restituire `WWW-Authenticate` con `resource_metadata` sui 401 MCP.
- [x] Dichiarare `securitySchemes` e scope nei tool MCP.
- [x] Implementare authorization-code OAuth MVP.
- [x] Implementare PKCE S256.
- [x] Vincolare token OAuth ad audience/resource MCP.
- [x] Impostare scadenza access token OAuth a un'ora.
- [x] Testare il flusso OAuth MVP end-to-end senza UI client.
- [ ] Testare in modo dedicato lo scope `content:publish`.
- [ ] Creare un registry OAuth client persistente.
- [ ] Sostituire il login password MVP con magic link, passkey, passwordless email o provider esterno.
- [ ] Implementare refresh token OAuth.
- [ ] Implementare endpoint di revoca OAuth self-service.
- [ ] Creare UI amministrativa per sessioni e revoca.
- [ ] Implementare dynamic client registration o CIMD se richiesto dai client.
- [ ] Implementare ID token/OIDC solo se un client reale lo richiede.

## 9. Tool MCP contenuti e sezioni

- [x] Implementare `get_page`.
- [x] Esporre `styleContract` in `get_page`.
- [x] Esporre `editableFields` in `get_page`.
- [x] Implementare `list_section_presets`.
- [x] Implementare `list_changes` con filtri pagina/sezione.
- [x] Implementare `disable_section`.
- [x] Implementare `enable_section`.
- [x] Implementare `update_text` con path contrattualizzati.
- [x] Implementare `update_rich_text` con `rich_text_v1`.
- [x] Supportare bold controllato.
- [x] Supportare italic controllato.
- [x] Supportare link controllati.
- [x] Coprire aggiunta e rimozione link tramite sostituzione `update_rich_text`, senza tool separati.
- [x] Implementare `update_cta`.
- [x] Implementare `update_contact_channel`.
- [x] Implementare `add_text_subsection` per `portfolio/text_2` e sezioni compatibili.
- [x] Implementare `add_section_from_preset` per il preset FAQ.
- [x] Implementare `add_faq_section`.
- [x] Implementare `add_faq_item`.
- [x] Implementare `update_faq_item`.
- [x] Implementare `remove_faq_item`.
- [x] Implementare `reorder_faq_items`.
- [x] Definire i preset sicuri `faq`, `text`, `cta`, `gallery`, `image_text`.
- [x] Mantenere `text`, `cta`, `gallery` e `image_text` non addable finche' non hanno un caso live completo.
- [x] Escludere il preset `hero` dal perimetro corrente finche' non si creano nuove pagine.
- [x] Rifiutare preset arbitrari e HTML libero.
- [ ] Implementare `get_site_snapshot`.
- [ ] Implementare `list_pages`.
- [ ] Implementare `list_sections`.
- [ ] Implementare `get_section`.
- [ ] Implementare `get_revision`.
- [ ] Implementare `update_page_meta`.
- [ ] Implementare `reorder_sections` su sezioni D1 realmente live.
- [ ] Implementare `update_section` per aggiornamenti strutturati non coperti dai tool specifici.
- [ ] Implementare `duplicate_section`.
- [ ] Implementare `delete_section_draft_only`.
- [ ] Implementare `update_text_subsection` semantico.
- [ ] Implementare `remove_text_subsection` semantico.
- [ ] Implementare `reorder_text_subsections` semantico.
- [ ] Rendere addable un preset `text` solo su un contratto/rendering live definito.
- [ ] Rendere addable un preset `cta` solo su un contratto/rendering live definito.
- [ ] Rendere addable un preset `gallery` usando esclusivamente asset media pronti.
- [ ] Creare e rendere addable un contratto `image_text` media-aware.

## 10. Media e immagini via MCP

- [x] Scegliere R2 puro come storage v1.
- [x] Creare `media_assets` e `media_usages`.
- [x] Implementare e verificare storicamente `create_image_upload`, `PUT /media/uploads/:uploadId` e `confirm_image_upload`.
- [x] Correggere il fallback browser eliminando `sizeBytes`, `width` e `height` stimati dal modello: firma, MIME, dimensioni e peso derivano dal file realmente selezionato; commit `ee1344f`, suite completa `185/185`.
- [x] Ritirare il fallback dalla build pubblica: nessun tool `create_image_upload`/`confirm_image_upload` e nessuna route `/media/uploads/*`; mantenere un kit di ripristino locale sotto `.local-only/media-browser-fallback/`, escluso da Git.
- [x] Implementare `list_media_assets`.
- [x] Implementare `replace_image` senza accettare `src` libero.
- [x] Implementare `attach_image_to_section` per array contrattualizzati.
- [x] Implementare `update_image_alt`.
- [x] Implementare `set_image_focal_point`.
- [x] Allineare `contact.hero` quando l'oggetto `image` non e ancora persistito: `set_image_focal_point` accetta sia `image` sia `image.focalPoint`, materializza l'override e conserva il fallback visuale; verificato live con rollback.
- [x] Implementare `set_image_visibility` per nascondere/mostrare una singola immagine senza cancellarla.
- [x] Esporre `items[].images[].enabled` nel contratto `portfolio.gallery` come fallback controllato.
- [x] Escludere dal renderer e dalle cover Home derivate le immagini con `enabled: false`.
- [x] Implementare e testare storicamente il fallback browser `uploadPageUrl`, poi ritirarlo dalla superficie pubblica dopo l'arrivo del file parameter.
- [x] Servire pubblicamente solo asset `ready` tramite `GET/HEAD /media/assets/:assetId/:filename`.
- [x] Validare firma e MIME effettivi rispetto alla allowlist JPEG/PNG/WebP/AVIF.
- [x] Validare la dimensione effettiva del file con limite 12 MB.
- [x] Estrarre `width` e `height` effettive dall'header immagine.
- [x] Rendere alt text obbligatorio per immagini informative.
- [x] Validare ownership dell'asset per sito.
- [x] Risolvere `assetId` in metadata renderizzabili.
- [x] Registrare `media_usages`.
- [x] Testare rollback di `replace_image` e riallineamento `media_usages`.
- [x] Eseguire storicamente smoke remoto create/upload/confirm con cleanup D1 e R2.
- [x] Deployare `attach_image_to_section` e verificarlo in `tools/list` live.
- [x] Verificare in produzione `set_image_visibility` tramite `tools/list` e rendering.
- [x] Completare storicamente un flusso reale ChatGPT -> `uploadPageUrl` -> R2 -> confirm -> attach prima del ritiro.
- [x] Implementare `remove_image_from_section` con revisione, audit e riallineamento completo di `media_usages`.
- [x] Deployare `remove_image_from_section`, `reorder_images_in_section` e `update_image_caption`; verificarli in `tools/list` e con smoke live seguito da rollback.
- [x] Implementare `reorder_images_in_section` con permutazione completa, audit, rollback e riallineamento `media_usages`.
- [x] Implementare `update_image_caption` per aggiornare o rimuovere la didascalia del singolo uso.
- [x] Aggiungere titolo editoriale, tag, note e ricerca al catalogo asset; deployato con migrazione `0011`, tool `update_media_asset` e smoke live con ripristino esatto.
- [ ] Implementare thumbnail/preview dedicate per l'asset manager.
- [x] Implementare archiviazione reversibile da `ready` ad `archived` e relativo ripristino, con audit e blocco per asset ancora usati; commit `b838516`, suite `170/170`.
- [x] Deployare `set_media_asset_archived` nel Worker `9efc103f-465f-4994-b326-e427b475dcf5` e verificarlo live con il blocco di un asset referenziato.
- [x] Implementare `delete_media_asset`: eliminazione fisica separata solo per asset `archived`, senza usi, nel namespace R2 del sito e con `confirm: true`; deploy `2a3aa4de-5fa8-41ad-b396-386f4b1e39c2`, smoke completo e cleanup senza residui.
- [x] Verificare la specifica OpenAI Plugins corrente: ChatGPT puo passare file ai tool tramite `_meta["openai/fileParams"]` come `{ download_url, file_id, mime_type?, file_name? }`; verifica documentale del 2026-08-01.
- [x] Esporre `upload_image_file` con file top-level conforme a `_meta["openai/fileParams"]` e schema completo `{ download_url, file_id, mime_type?, file_name? }`.
- [x] Trattare `file_id` come identificatore opaco senza regex di formato proprietaria; limitare solo lunghezza e caratteri di controllo, lasciando la sicurezza a URL HTTPS e verifica dei byte.
- [x] Scaricare il `download_url` temporaneo con HTTPS obbligatorio, blocco host locali/IP, timeout globale, massimo 3 redirect e limite 12 MB, trasferendo lo stream nel bucket R2.
- [x] Verificare firma/magic bytes e struttura dimensionale per JPEG, PNG, WebP e AVIF, senza fidarsi di estensione, MIME dichiarato o `Content-Type`.
- [ ] Verificare la decodificabilita completa dell'immagine oltre la validazione strutturale dell'header.
- [x] Estrarre `width` e `height` reali dal contenuto nel percorso diretto.
- [x] Riutilizzare catalogo D1, audit, ownership, stato `ready` e tool esistenti `attach_image_to_section`/`replace_image`, con cleanup R2 se la scrittura D1 atomica fallisce.
- [x] Scegliere una sola pipeline pubblica: `upload_image_file` con file parameter; il fallback browser corretto resta solo locale e git-ignorato.
- [x] Testare localmente descriptor, quattro formati, redirect, timeout, limiti, mismatch MIME/firma, streaming R2, cleanup D1 e chiamata MCP autenticata.
- [x] Deployare `upload_image_file` nel Worker `d82fbe3d-565b-4d92-bc71-7e16580ac4e7`, verificare lo storico `tools/list` a 32 tool e fare uno smoke read-only senza creare asset di prova.
- [ ] Implementare strip EXIF/GPS prima della pubblicazione.
- [ ] Decidere e implementare scansione antivirus/security se applicabile.
- [ ] Testare rollback esplicito di `attach_image_to_section`.
- [x] Testare rollback esplicito di `remove_image_from_section`, incluso il ripristino degli indici `media_usages`.
- [x] Testare rollback esplicito di `reorder_images_in_section`, incluso il ripristino degli indici `media_usages`.
- [ ] Testare end-to-end con un connector ChatGPT reale: allegato -> file parameter -> Worker -> R2 -> asset `ready` -> attach/replace, senza `uploadPageUrl`.

## 11. Preview, publish, revisioni e audit

- [x] Creare `section_revisions` per le modifiche contenutistiche.
- [x] Creare righe `change_log` per le modifiche contenutistiche.
- [x] Implementare `rollback_change` per `changeId`.
- [x] Implementare `rollback_change` per `revisionId`.
- [x] Implementare rollback dell'ultimo cambio per pagina/sezione.
- [x] Bloccare rollback stale quando lo stato corrente non coincide con lo snapshot `after`.
- [x] Testare rollback testo.
- [x] Testare rollback visibilita' sezione.
- [x] Testare rollback sostituzione immagine.
- [ ] Decidere formalmente tra fast mode e safe mode.
- [ ] Implementare `validate_change`.
- [ ] Implementare `preview_change`.
- [ ] Implementare `apply_change` generico solo se utile al workflow scelto.
- [ ] Implementare `publish_change` se si adotta draft/publish.
- [ ] Creare URL/API di preview.
- [ ] Testare rollback FAQ esplicitamente.
- [ ] Esporre e testare la lista revisioni.
- [ ] Restituire un riepilogo umano/AI-friendly di ogni modifica.
- [ ] Registrare ogni tool call, incluse letture e fallimenti, non solo le mutazioni riuscite.
- [ ] Registrare actor, tool, input normalizzato, risultato e timestamp per ogni tool call.

## 12. Client AI e onboarding

- [x] Testare il remote MCP con un client Node generico e bearer token.
- [x] Testare `initialize`, `tools/list` e `tools/call` sul remoto.
- [x] Testare ChatGPT/OAuth senza UI ChatGPT.
- [x] Testare un connector ChatGPT reale per lettura e modifiche testo/contatti.
- [x] Documentare onboarding bearer token per client generici.
- [x] Documentare onboarding OAuth per ChatGPT.
- [x] Documentare onboarding per Claude.
- [x] Documentare prompt naturali e rollback per Lorenzo.
- [x] Documentare che i segreti non vanno incollati in chat.
- [x] Testare storicamente il flusso immagini con un connector ChatGPT reale usando `uploadPageUrl` prima del suo ritiro.
- [ ] Testare esplicitamente con MCP Inspector CLI, non solo con client equivalente.
- [ ] Testare un Claude custom connector reale.
- [ ] Testare in un connector ChatGPT reale il nuovo `upload_image_file` con `_meta["openai/fileParams"]` dopo implementazione e deploy.
- [x] Verificare e documentare i requisiti correnti: il plugin pubblico richiede client con file parameter; client generici privi di tale capacita non ricevono un fallback online.
- [ ] Documentare i limiti correnti dei piani Free/Pro dove incidono sul connector.

## 13. Sicurezza e osservabilita'

- [x] Impedire all'AI di modificare HTML, CSS, JavaScript e configurazioni.
- [x] Validare i campi contro `editableFields`.
- [x] Bloccare HTML arbitrario nei tool di testo e FAQ.
- [x] Bloccare marks rich text non consentiti.
- [x] Bloccare URL `javascript:`, `data:` e path ambigui.
- [x] Rifiutare modifiche fuori contratto.
- [x] Salvare token personali, OAuth code, OAuth token e upload token solo come hash.
- [x] Ignorare `.secrets/`, `.dev.vars`, `.local-only/` e artefatti locali in Git.
- [ ] Aggiungere rate limit per token e/o actor.
- [ ] Restringere e validare `Origin` per l'endpoint MCP remoto.
- [ ] Aggiungere test di redazione segreti nei log.
- [ ] Bloccare o neutralizzare prompt injection nei contenuti letti dal CMS.
- [ ] Standardizzare errori leggibili senza dettagli sensibili.
- [ ] Creare backup/export periodico D1.
- [ ] Definire retention e cleanup di authorization code, access token e upload session scaduti.

### Protezione contenuti pubblici e traffico

- [ ] Configurare un rate limiting conservativo per `GET/HEAD /media/assets/*`, con soglie distinte dal rate limit MCP e verifica che portfolio, lightbox e crawler legittimi non vengano bloccati.
- [ ] Configurare regole WAF mirate per host e percorsi sensibili, includendo eccezioni esplicite per i flussi legittimi MCP, OAuth e upload.
- [ ] Configurare bot detection e AI bot policy: consentire i crawler Search, valutare separatamente gli Agent e bloccare i bot usati per AI Training.
- [ ] Eseguire smoke test completi dopo l'attivazione di rate limit, WAF e AI bot policy e controllare i Security Events per falsi positivi.
- [ ] Documentare soglie, regole, eccezioni e procedura di rollback della configurazione Cloudflare.

## 14. Immagini responsive e performance frontend

- [x] Dichiarare `width` e `height` sulle immagini statiche correnti.
- [x] Usare lazy loading sotto il fold.
- [x] Dare priorita' alle immagini hero correnti.
- [x] Evitare librerie JavaScript pesanti per animazioni e lightbox.
- [x] Definire un modello strutturato immagini tramite `media_assets` e `assetId`.
- [ ] Generare AVIF, WebP e JPG fallback per ogni asset.
- [ ] Generare dimensioni mobile, tablet e desktop.
- [ ] Usare `srcset` e `sizes` su tutte le immagini editoriali.
- [ ] Precaricare soltanto la hero image della pagina corrente.
- [ ] Valutare blur placeholder o dominant-color placeholder.
- [ ] Generare e registrare varianti responsive per gli asset R2.
- [ ] Impostare cache header lunghi per asset fingerprinted.
- [ ] Misurare Lighthouse mobile sul sito live.
- [ ] Definire budget di peso per pagina e immagini.

### Deterrenti frontend al download casuale

- [ ] Documentare che i controlli HTML/CSS/JavaScript sono deterrenti contro il download casuale e non possono proteggere in modo assoluto un'immagine pubblicamente visibile.
- [ ] Servire nel sito pubblico soltanto varianti web ottimizzate, mai gli originali ad alta risoluzione caricati nel media store.
- [ ] Impostare `draggable="false"` su tutte le immagini editoriali, incluse gallery, cover, hero e lightbox.
- [ ] Applicare alle immagini protette CSS coerente con `user-select: none`, `-webkit-user-drag: none` e `-webkit-touch-callout: none`.
- [ ] Intercettare centralmente `dragstart` e `contextmenu` soltanto sulle immagini protette, senza handler inline e senza bloccare il menu contestuale nel resto del sito.
- [ ] Evitare link diretti al file, attributi `download` e controlli del lightbox che espongano volontariamente l'URL dell'asset originale.
- [ ] Valutare un wrapper o overlay trasparente per impedire l'interazione diretta mouse/touch con l'elemento immagine, preservando click del lightbox, tastiera e screen reader.
- [ ] Verificare che i deterrenti non rompano alt text, indicizzazione, zoom, navigazione da tastiera, gesture touch e `prefers-reduced-motion`.
- [ ] Aggiungere test renderer/browser per attributi anti-drag, blocco contestuale circoscritto e assenza di URL originali nell'HTML pubblico.

## 15. Accessibilita', SEO e sicurezza web

- [x] Usare struttura semantica con `nav`, `main`, sezioni e H1 unici.
- [x] Aggiungere focus visibile a link, bottoni e gallery.
- [x] Rispettare `prefers-reduced-motion`.
- [x] Rendere il lightbox chiudibile con Escape.
- [x] Rendere il lightbox navigabile con frecce sinistra/destra.
- [x] Ripristinare il focus alla chiusura del lightbox.
- [x] Aggiungere title e meta description alle pagine pubbliche.
- [x] Aggiungere Open Graph e URL canonici.
- [x] Redirectare gli alias `.html` e `index.php` alle URL canoniche.
- [x] Pubblicare `robots.txt`.
- [x] Pubblicare `sitemap.xml`.
- [x] Verificare assenza di cookie, storage persistente e analytics.
- [x] Esporre la nota privacy cookie solo dal footer.
- [ ] Eseguire un test manuale completo tastiera su menu, FAQ, lightbox e pannello privacy.
- [ ] Eseguire un audit WCAG 2.2 AA sui contrasti con le foto reali.
- [ ] Confermare manualmente gli alt text foto per foto.
- [ ] Aggiungere JSON-LD `Person` e `WebSite` coerente con il contenuto visibile.
- [ ] Aggiungere JSON-LD `ImageGallery`/`ImageObject` dove utile.
- [ ] Configurare `Content-Security-Policy`.
- [ ] Configurare `Strict-Transport-Security`.
- [ ] Configurare `X-Content-Type-Options: nosniff`.
- [ ] Configurare `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] Configurare una `Permissions-Policy` restrittiva.
- [ ] Collegare Google Search Console e inviare la sitemap.
- [ ] Verificare l'indicizzazione effettiva dopo l'invio in Search Console.

## 16. Repository e documentazione

- [x] Tracciare `edge/` senza `.dev.vars`.
- [x] Tracciare `mcp/`.
- [x] Tracciare le immagini runtime ottimizzate.
- [x] Escludere le immagini sorgente pesanti in `assets/portfolio/`.
- [x] Escludere gli audio WhatsApp grezzi.
- [x] Escludere i transcript locali.
- [x] Escludere `.deploy/`.
- [x] Verificare `.gitignore`.
- [x] Evitare segreti nei file versionati.
- [x] Separare il lavoro in commit tecnici circoscritti.
- [x] Commit e push della foundation TDD/MCP.
- [x] Commit e push della pipeline OAuth/auth.
- [x] Commit e push della pipeline media/R2.
- [x] Commit e push di `attach_image_to_section`.
- [x] Valutare il branch dedicato e mantenere `main` per i deploy gia' eseguiti nel flusso storico.
- [x] Documentare stato deploy e stato repository nei recap tecnici.
- [x] Allineare `edge/README.md` alla superficie storica di 32 tool verificata live.
- [x] Allineare `mcp/README.md` al sito live dinamico e distinguere MCP locale e remoto.
- [x] Aggiornare esempi media, componenti e migrazioni `0009`-`0011` nel manuale template.
- [x] Allineare contratti, onboarding e handoff al tool `set_image_visibility`.
- [x] Allineare la documentazione attiva alla superficie direct-only di 30 tool e al ritiro del fallback browser.
- [x] Archiviare `NEXT_CHAT_RECAP.md`, `MCP_TDD_TODO.md`, `MCP_NEXT_PHASES_TODO.md` e `MCP_REMOTE_ROADMAP.md` in `archive/docs/`.
