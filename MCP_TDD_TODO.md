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
- [ ] Disegnare schema D1 per `auth_tokens` o modello auth scelto.
- [x] Scrivere migration SQL iniziale.
- [ ] Testare creazione pagina con sezioni ordinate.
- [ ] Testare sezione con campi `id`, `type`, `enabled`, `order`, `data`.
- [x] Testare `disable_section` sul modello dati.
- [ ] Testare `enable_section` sul modello dati.
- [ ] Testare `reorder_sections`.
- [ ] Testare aggiunta sezione da preset.
- [ ] Testare aggiunta sezione FAQ a pagina senza FAQ.
- [x] Testare disattivazione FAQ senza cancellazione dati.
- [ ] Testare rollback a revisione precedente.

## 4. Prima vertical slice locale

Prima farla funzionare senza remote MCP, usando funzioni interne/test.

- [x] Creare fixture D1 locale con pagina `portfolio`.
- [x] Creare fixture sezione `faq` enabled.
- [x] Scrivere test rosso: `disable_section` deve portare `enabled=false`.
- [x] Implementare funzione dominio `disableSection`.
- [x] Scrivere revisione/change log durante `disableSection`.
- [ ] Aggiungere test rollback.
- [ ] Implementare funzione dominio `rollbackChange`.
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
- [ ] Esporre tool `get_page`.
- [x] Esporre tool `disable_section`.
- [ ] Esporre tool `enable_section`.
- [ ] Esporre tool `list_changes`.
- [x] Testare `disable_section` via chiamata MCP HTTP compatibile.
- [x] Testare output `structuredContent`.
- [ ] Testare errori MCP standardizzati.

## 7. Auth e permessi

Non incollare segreti in chat. Il connector deve gestire credenziali.

- [ ] Decidere auth iniziale:
  - [ ] token personale scoped;
  - [ ] OAuth completo;
  - [ ] magic link + token.
- [ ] Creare tabella token/utenti se si parte da token personale.
- [ ] Definire ruolo `owner`.
- [ ] Definire ruolo `editor`.
- [ ] Definire ruolo `publisher`.
- [ ] Testare token mancante.
- [ ] Testare token invalido.
- [ ] Testare token revocato.
- [ ] Testare permesso lettura.
- [ ] Testare permesso scrittura.
- [ ] Testare permesso pubblicazione.
- [ ] Loggare `actor` reale, non solo `mcp-lorenzozanna`.
- [ ] Preparare istruzioni di onboarding Lorenzo.

## 8. Tool MCP contenuti

Dopo la prima slice, aggiungere tool uno per volta.

- [ ] `get_site_snapshot`.
- [ ] `list_pages`.
- [ ] `get_page`.
- [ ] `list_sections`.
- [ ] `get_section`.
- [ ] `update_page_meta`.
- [ ] `update_text`.
- [ ] `update_rich_text`.
- [ ] `add_link`.
- [ ] `remove_link`.
- [ ] `update_cta`.
- [ ] `add_section_from_preset`.
- [ ] `disable_section`.
- [ ] `enable_section`.
- [ ] `reorder_sections`.
- [ ] `update_section`.
- [ ] `duplicate_section`.
- [ ] `rollback_change`.

## 9. Rich text controllato

Permettere bold, italic e link senza permettere HTML arbitrario.

- [ ] Decidere formato rich text:
  - [ ] markdown controllato;
  - [ ] array di span;
  - [ ] HTML sanitizzato server-side.
- [ ] Testare bold.
- [ ] Testare italic.
- [ ] Testare link.
- [ ] Testare rimozione link.
- [ ] Bloccare script.
- [ ] Bloccare HTML non consentito.
- [ ] Bloccare URL pericolosi.
- [ ] Renderizzare rich text in HTML sicuro.

## 10. Preset sezioni

Le sezioni aggiunte da Lorenzo devono essere preimpostate da noi.

- [ ] Definire preset `faq`.
- [ ] Definire preset `text`.
- [ ] Definire preset `hero`.
- [ ] Definire preset `cta`.
- [ ] Definire preset `gallery`.
- [ ] Definire preset `image_text`.
- [ ] Tool `list_section_presets`.
- [ ] Tool `add_section_from_preset`.
- [ ] Testare aggiunta FAQ a pagina senza FAQ.
- [ ] Testare che non si possano creare tipi sezione arbitrari.

## 11. FAQ workflow

- [ ] Tool `add_faq_section`.
- [ ] Tool `add_faq_item`.
- [ ] Tool `update_faq_item`.
- [ ] Tool `remove_faq_item`.
- [ ] Tool `reorder_faq_items`.
- [ ] Testare FAQ vuota.
- [ ] Testare FAQ con item validi.
- [ ] Testare FAQ disattivata ma conservata.
- [ ] Testare rendering FAQ.

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
- [ ] Implementare `rollback_change`.
- [ ] Testare rollback ultimo cambio.
- [ ] Testare rollback a revision specifica.
- [ ] Testare lista revisioni.
- [ ] Testare messaggio umano di riepilogo modifica.

## 14. Compatibilita Claude e ChatGPT

- [ ] Verificare requisiti correnti Claude custom connector.
- [ ] Verificare requisiti correnti ChatGPT app/plugin/MCP.
- [ ] Testare remote MCP con MCP Inspector.
- [ ] Testare con Claude custom connector.
- [ ] Testare con ChatGPT developer mode/app, se disponibile.
- [ ] Documentare setup per Lorenzo.
- [ ] Documentare limiti piano Free/Pro dove necessario.
- [ ] Evitare dipendenza da una singola piattaforma.

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
