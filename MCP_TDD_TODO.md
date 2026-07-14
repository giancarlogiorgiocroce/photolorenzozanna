# TODO TDD - MCP remoto e sito dinamico

Data: 2026-07-13
Progetto locale: `C:\Users\gianc\Documents\codice\lorenzozanna`

Questo TODO traduce la roadmap in una sequenza TDD. L'obiettivo non e costruire tutto subito, ma far passare una prima vertical slice completa:

```text
disable_section(page="portfolio", sectionId="faq")
  -> MCP remoto
  -> auth
  -> D1 aggiornato
  -> sito online aggiornato al refresh
  -> rollback disponibile
```

Legenda:

- `[x]` gia fatto o verificato
- `[ ]` da fare

## 0. Stato gia presente

- [x] Progetto locale disponibile in `C:\Users\gianc\Documents\codice\lorenzozanna`.
- [x] Sito statico esistente con pagine `index.html`, `about.html`, `portfolio.html`, `contact.html`.
- [x] Dominio pubblico frontend attivo: `https://ph.lorenzozanna.com`.
- [x] Worker API Cloudflare attivo: `https://api.lorenzozanna.com`.
- [x] Health check API verificato: `/api/health`.
- [x] Database D1 esistente: `lorenzozanna_content`.
- [x] API pubblica contenuti esistente: `/api/public/sites/ph/content`.
- [x] API privata con `AI_API_TOKEN` esistente.
- [x] MCP locale esistente in `mcp/lorenzozanna-server.mjs`.
- [x] Client MCP locale esistente in `mcp/call-tool.mjs`.
- [x] Tool MCP locali esistenti: `get_public_content`, `upsert_content`, `list_changes`, `sync_content_markdown`.
- [x] Sync contenuti via MCP gia eseguito almeno una volta.
- [x] Change log remoto contiene azioni con actor `mcp-lorenzozanna`.
- [x] Documento strategico creato: `MCP_REMOTE_ROADMAP.md`.
- [x] Contratti sezioni reali mappati: `MCP_SECTION_CONTRACTS.md`.

## 1. Primo obiettivo TDD

- [ ] Scrivere il primo scenario end-to-end in forma testabile:

```text
Dato che la pagina Portfolio ha una sezione FAQ visibile
quando Lorenzo chiede via MCP di disattivare quella sezione
allora D1 viene aggiornato
e una richiesta a /portfolio non mostra piu la FAQ
senza commit, push o redeploy.
```

- [ ] Decidere il nome tecnico del primo tool: `disable_section`.
- [ ] Decidere il formato input minimo:

```json
{
  "site": "ph",
  "page": "portfolio",
  "sectionId": "faq"
}
```

- [ ] Decidere il formato output minimo:

```json
{
  "site": "ph",
  "page": "portfolio",
  "sectionId": "faq",
  "enabled": false,
  "revisionId": "...",
  "previewUrl": "...",
  "published": true
}
```

## 2. Test di caratterizzazione dell'esistente

Prima di refactorare, bloccare il comportamento gia funzionante.

- [x] Scegliere test runner per Worker/MCP: `node:test`, senza dipendenze esterne.
- [x] Aggiungere script test in `edge/package.json`.
- [x] Testare `GET /api/health`.
- [x] Testare `GET /api/public/sites/ph/content`.
- [x] Testare risposta 401/403 su API privata senza token.
- [x] Testare upsert privato contenuto semplice.
- [x] Testare che ogni upsert scriva una riga in `change_log`.
- [x] Testare filtro published/draft nella public API.
- [x] Testare che `pages/piano-seo` resti draft/internal e non pubblico.
- [x] Testare che i contenuti pubblici attuali restino leggibili.

## 3. Test del modello dati nuovo

Obiettivo: passare da contenuti sparsi a pagine con sezioni strutturate.

- [x] Disegnare schema D1 per `pages`.
- [x] Disegnare schema D1 per `sections`.
- [x] Disegnare schema D1 per `section_revisions`.
- [ ] Disegnare schema D1 per `media_assets`.
- [x] Disegnare schema D1 per `auth_tokens` o modello auth scelto.
- [x] Scrivere migration SQL iniziale.
- [ ] Testare creazione pagina con sezioni ordinate.
- [ ] Testare sezione con campi `id`, `type`, `enabled`, `order`, `data`.
- [x] Testare `disable_section` sul modello dati.
- [x] Testare `enable_section` sul modello dati.
- [ ] Testare `reorder_sections`.
- [x] Testare aggiunta sezione da preset.
- [x] Testare aggiunta sezione FAQ a pagina senza FAQ.
- [x] Testare disattivazione FAQ senza cancellazione dati.
- [x] Testare rollback a revisione precedente.

## 4. Prima vertical slice locale

Prima farla funzionare senza remote MCP, usando funzioni interne/test.

- [x] Creare fixture D1 locale con pagina `portfolio`.
- [x] Creare fixture sezione `faq` enabled.
- [x] Scrivere test rosso: `disable_section` deve portare `enabled=false`.
- [x] Implementare funzione dominio `disableSection`.
- [x] Scrivere revisione/change log durante `disableSection`.
- [x] Scrivere test rosso: `enable_section` deve portare `enabled=true`.
- [x] Implementare funzione dominio `enableSection`.
- [x] Scrivere revisione/change log durante `enableSection`.
- [x] Aggiungere test rollback.
- [x] Implementare funzione dominio `rollbackChange`.
- [ ] Validare errori:
  - [x] pagina inesistente;
  - [x] sezione inesistente;
  - [ ] sezione gia disattivata;
  - [ ] utente senza permesso.

## 5. Rendering dinamico sito

Questa parte elimina la latenza da deploy.

- [ ] Decidere se servire `ph.lorenzozanna.com` da Worker dinamico.
- [x] Creare renderer HTML da D1 per pagina `portfolio`.
- [x] Testare che se `faq.enabled=true`, HTML contiene FAQ.
- [x] Testare che se `faq.enabled=false`, HTML non contiene FAQ.
- [x] Testare che il renderer non mostri sezioni draft/disabled.
- [x] Testare ordinamento sezioni.
- [x] Testare cache header coerenti con zero latenza editoriale.
- [ ] Decidere strategia cache:
  - [ ] no cache per HTML durante prima fase;
  - [ ] cache breve;
  - [ ] purge/invalidation dopo modifica.
- [x] Collegare route pubblica `/portfolio` o `/portfolio.html` al renderer.
- [ ] Verificare refresh browser dopo modifica MCP.

## 6. MCP remoto Streamable HTTP

Portare il server da locale `stdio` a remoto HTTP.

- [ ] Definire endpoint finale, per esempio `https://mcp.lorenzozanna.com/mcp`.
- [x] Implementare `initialize` via HTTP.
- [x] Implementare `tools/list` via HTTP.
- [x] Implementare `tools/call` via HTTP.
- [ ] Testare header `MCP-Protocol-Version`.
- [ ] Testare `Accept: application/json, text/event-stream`.
- [ ] Decidere se supportare SSE subito o solo risposta JSON.
- [x] Testare richiesta senza auth.
- [x] Testare richiesta con auth valida.
- [x] Esporre tool `get_page`.
- [x] Esporre tool `disable_section`.
- [x] Esporre tool `enable_section`.
- [x] Esporre tool `list_changes`.
- [x] Testare `disable_section` via chiamata MCP HTTP compatibile.
- [x] Testare `enable_section` via chiamata MCP HTTP compatibile.
- [x] Testare output `structuredContent`.
- [ ] Testare errori MCP standardizzati.

## 7. Auth e permessi

Non incollare segreti in chat. Il connector deve gestire credenziali.

- [x] Decidere auth iniziale:
  - [x] token personale scoped;
  - [ ] OAuth completo;
  - [ ] magic link + token.
- [x] Creare tabella token/utenti se si parte da token personale.
- [x] Definire ruolo `owner`.
- [x] Definire ruolo `editor`.
- [x] Definire ruolo `publisher`.
- [x] Testare token mancante.
- [x] Testare token invalido.
- [x] Testare token revocato.
- [x] Testare permesso lettura.
- [x] Testare permesso scrittura.
- [ ] Testare permesso pubblicazione.
- [x] Loggare `actor` reale, non solo `mcp-lorenzozanna`.
- [x] Preparare istruzioni di onboarding Lorenzo.
- [x] Testare protected resource metadata OAuth/MCP.
- [x] Testare authorization server metadata.
- [x] Testare `WWW-Authenticate` con `resource_metadata` sui 401 MCP.
- [x] Testare `securitySchemes` sui tool MCP.
- [ ] Implementare authorization-code flow OAuth completo.
- [ ] Testare PKCE S256.
- [ ] Testare audience/resource binding dei token OAuth.
- [ ] Testare revoca/expiry token OAuth.

## 8. Tool MCP contenuti

Dopo la prima slice, aggiungere tool uno per volta.

- [x] Creare registry contratti sezioni da `MCP_SECTION_CONTRACTS.md`.
- [ ] `get_site_snapshot`.
- [ ] `list_pages`.
- [x] `get_page`.
  - [x] includere `styleContract`;
  - [x] includere `editableFields`;
  - [x] distinguere `plain_text`, `text_list`, `rich_text`, `link`, `image`.
- [ ] `list_sections`.
- [ ] `get_section`.
- [x] `list_changes`.
  - [x] leggere `change_log`;
  - [x] filtrare per `page` e `sectionId`;
  - [x] consentire accesso con `content:read`;
  - [x] restituire `before`/`after` parsati e target normalizzato per AI.
- [ ] `update_page_meta`.
- [x] `update_text`.
  - [x] validare path contro `editableFields`;
  - [x] validare lunghezze;
  - [x] bloccare HTML arbitrario;
  - [x] scrivere `section_revisions` e `change_log`.
- [x] `update_rich_text`.
- [ ] `add_link`.
- [ ] `remove_link`.
- [x] `update_cta`.
- [ ] `add_section_from_preset`.
- [x] `disable_section`.
- [x] `enable_section`.
- [ ] `reorder_sections`.
- [ ] `update_section`.
- [ ] `duplicate_section`.
- [x] `rollback_change`.
  - [x] rollback per `changeId`;
  - [x] rollback ultimo cambio filtrato per pagina/sezione;
  - [x] rollback per `revisionId`;
  - [x] guardia stale sullo snapshot `after`;
  - [x] revision/change log del rollback.

## 9. Rich text controllato

Permettere bold, italic e link senza permettere HTML arbitrario.

- [x] Decidere formato rich text:
  - [ ] markdown controllato;
  - [x] array di span con `marks[]`;
  - [ ] HTML sanitizzato server-side.
- [x] Implementare `rich_text_v1` da `MCP_SECTION_CONTRACTS.md`.
- [x] Testare bold.
- [x] Testare italic.
- [x] Testare link.
- [x] Testare rimozione link.
- [x] Bloccare script.
- [x] Bloccare HTML non consentito.
- [x] Bloccare URL pericolosi.
- [x] Renderizzare rich text in HTML sicuro.

Nota 2026-07-14: in v1 `add_link` e `remove_link` non sono tool separati; si ottengono sostituendo il valore del campo con `update_rich_text`, rispettando il contratto `rich_text_v1`.

## 10. Preset sezioni

Le sezioni aggiunte da Lorenzo devono essere preimpostate da noi.

- [x] Definire preset `faq`.
- [x] Definire preset `text`.
- [ ] Definire preset `hero`.
- [x] Definire preset `cta`.
- [x] Definire preset `gallery`.
- [x] Definire preset `image_text`.
- [x] Tool `list_section_presets`.
- [x] Tool `add_section_from_preset`.
  - Stato 2026-07-14: supporta `faq` in v1; preset non ancora addable come `gallery` e `image_text` vengono rifiutati.
- [x] Testare aggiunta FAQ a pagina senza FAQ.
- [x] Testare che non si possano creare tipi sezione arbitrari.

## 11. FAQ workflow

- [x] Tool `add_faq_section`.
- [x] Tool `add_faq_item`.
- [x] Tool `update_faq_item`.
- [x] Tool `remove_faq_item`.
- [x] Tool `reorder_faq_items`.
- [x] Testare FAQ vuota.
- [x] Testare FAQ con item validi.
- [x] Testare FAQ disattivata ma conservata.
- [x] Testare rendering FAQ.
  - Test 2026-07-14: suite `npm test` in `edge` -> 85 test verdi.

## 12. Media e immagini

Da fare dopo testi/sezioni, perche aggiunge storage e sicurezza.

- [ ] Decidere storage: R2 o Cloudflare Images.
- [ ] Creare bucket R2 se necessario.
- [ ] Definire tabella `media_assets`.
- [ ] Tool `create_image_upload`.
- [ ] Tool `confirm_image_upload`.
- [ ] Tool `replace_image`.
- [ ] Tool `attach_image_to_section`.
- [ ] Tool `update_image_alt`.
- [ ] Tool `set_image_focal_point`.
- [ ] Tool `remove_image_from_section`.
- [ ] Testare alt text obbligatorio.
- [ ] Testare formati permessi.
- [ ] Testare dimensione massima.
- [ ] Testare rollback immagine.
- [ ] Testare rendering responsive.

## 13. Preview, publish e rollback

- [ ] Decidere modalita iniziale:
  - [ ] fast mode: modifica live subito;
  - [ ] safe mode: draft -> preview -> publish.
- [ ] Implementare `preview_change`.
- [ ] Implementare `validate_change`.
- [ ] Implementare `apply_change`.
- [ ] Implementare `publish_change` se si usa draft.
- [x] Implementare `rollback_change`.
- [x] Testare rollback ultimo cambio.
- [x] Testare rollback a revision specifica.
- [ ] Testare lista revisioni.
- [ ] Testare messaggio umano di riepilogo modifica.

## 14. Compatibilita client AI

- [x] Mantenere architettura provider-neutral: MCP standard prima, adattatori client dopo.
  - Verifica 2026-07-14: smoke remoto con client Node generico JSON-RPC e bearer token; ricerca in `edge/src`, `edge/test` e `edge/migrations` senza riferimenti provider-specifici.
- [ ] Verificare requisiti correnti Claude custom connector.
- [ ] Verificare requisiti correnti ChatGPT app/plugin/MCP.
- [ ] Testare remote MCP con MCP Inspector.
- [ ] Testare con Claude custom connector.
- [ ] Testare con ChatGPT developer mode/app, se disponibile.
- [x] Testare con almeno un client MCP generico che supporta bearer token.
  - Smoke 2026-07-14: `initialize`, `tools/list`, `get_page`, `list_changes`, `disable_section` su fixture temporanea; cleanup D1 completato.
- [ ] Documentare setup per Lorenzo.
- [ ] Documentare limiti piano Free/Pro dove necessario.
- [x] Evitare dipendenza da una singola piattaforma.
  - Verifica 2026-07-14: tool e permessi MCP non dipendono da ChatGPT, Claude o altri client specifici.

## 15. Osservabilita e sicurezza

- [ ] Loggare ogni tool call.
- [ ] Loggare actor, tool, input normalizzato, result, timestamp.
- [ ] Nascondere segreti dai log.
- [ ] Rate limit per token.
- [ ] Protezione Origin per endpoint MCP remoto.
- [ ] Validazione schema input per ogni tool.
- [ ] Errori leggibili per la chat.
- [ ] Bloccare modifiche fuori dallo schema.
- [ ] Bloccare prompt injection nei contenuti recuperati.
- [ ] Backup/export periodico D1.

## 16. Consolidamento progetto

- [ ] Decidere quali file committare.
- [ ] Escludere segreti e artefatti locali.
- [ ] Verificare `.gitignore`.
- [ ] Tracciare `edge/` senza `.dev.vars`.
- [ ] Tracciare `mcp/`.
- [ ] Tracciare documentazione roadmap/TODO.
- [ ] Decidere cosa fare con immagini sorgente pesanti.
- [ ] Decidere cosa fare con `.deploy/`.
- [ ] Creare branch dedicato, se utile.
- [ ] Fare commit tecnico quando la base e pulita.

## Sequenza consigliata delle prime 10 azioni

1. [x] Aggiungere test runner per `edge`.
2. [x] Scrivere test caratterizzazione `/api/health`.
3. [x] Scrivere test caratterizzazione public content.
4. [x] Disegnare migration minima `sections`.
5. [x] Scrivere test dominio `disableSection`.
6. [x] Implementare `disableSection`.
7. [x] Scrivere renderer HTML minimo per `portfolio`.
8. [x] Testare FAQ visibile/non visibile nel renderer.
9. [x] Esporre `disable_section` come tool MCP HTTP.
10. [x] Fare test end-to-end locale: tool -> D1 -> HTML.

## Definizione della prima milestone

La milestone 1 e completata quando:

- [ ] esiste un test end-to-end verde per `disable_section`;
- [ ] il sito viene renderizzato da D1 almeno per `portfolio`;
- [ ] la FAQ puo essere disattivata senza deploy;
- [ ] il cambio e loggato;
- [ ] il rollback funziona;
- [x] il tool e invocabile via MCP remoto o simulazione HTTP compatibile.
