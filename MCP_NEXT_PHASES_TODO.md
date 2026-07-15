# TODO prossime fasi MCP remoto

Data: 2026-07-13
Commit base gia pushato: `d1eb371 Add TDD foundation for remote MCP`

Questo file serve come traccia per aprire piu chat parallele sui pezzi rimasti dopo la prima foundation TDD.

Legenda:

- `[x]` fatto
- `[ ]` da fare

## Stato gia chiuso

- [x] Roadmap generale creata in `MCP_REMOTE_ROADMAP.md`.
- [x] TODO TDD creato in `MCP_TDD_TODO.md`.
- [x] Contratti sezioni MCP mappati in `MCP_SECTION_CONTRACTS.md`.
- [x] Worker API esistente messo sotto test.
- [x] Migration iniziale `pages`, `page_sections`, `section_revisions`.
- [x] Renderer dinamico HTML minimo da D1.
- [x] Route pubblica locale `/portfolio` e `/portfolio.html` collegata al renderer.
- [x] MCP HTTP minimale con:
  - [x] `initialize`;
  - [x] `tools/list`;
  - [x] `tools/call`.
- [x] Primo tool MCP: `disable_section`.
- [x] Vertical slice locale:

```text
POST /mcp tools/call disable_section
  -> D1 aggiornato
  -> /portfolio renderizzato senza FAQ
```

- [x] Test verdi: `npm test`, 18 test passanti.
- [x] Commit e push su `main`: `d1eb371`.

## 1. Deploy remoto del nuovo Worker/MCP

Obiettivo: rendere il nuovo codice Worker/MCP raggiungibile online.

- [x] Verificare differenza tra Worker attualmente deployato e codice locale.
  - Verifica 2026-07-14: il remoto `https://api.lorenzozanna.com` serve ancora la superficie API storica (`/api/health` e `/api/public/sites/ph/content` OK), ma non espone il nuovo MCP/rendering locale.
  - Esito remoto: `GET /mcp` -> 404 `Route not found`; `GET /portfolio?site=ph` -> 404 `Route not found`.
  - Esito locale: `npm test` in `edge/` -> 24 test verdi; la root locale ora dichiara in modo testato `/mcp`, `/portfolio`, `/portfolio.html` e capability `remoteMcp`/`dynamicPages`.
- [x] Verificare `wrangler.toml` e route attuali.
  - Verifica 2026-07-14: `wrangler.toml` punta al Worker `lorenzozanna-edge`, entrypoint `src/index.mjs`, `workers_dev = false`, binding D1 `DB` -> `lorenzozanna_content`, `ROOT_DOMAIN = "lorenzozanna.com"`.
  - Route locale configurata: unico `[[routes]]` con `pattern = "api.lorenzozanna.com"` e `custom_domain = true`; nessuna route locale per `mcp.lorenzozanna.com`.
  - Stato produzione Wrangler: deployment attivo `56086f46-ca5f-4595-b51a-e7376c77923c`, creato il 2026-07-04T10:12:47Z.
  - Cloudflare API: nessuna Workers Route classica nella zona; un Worker Custom Domain attivo `api.lorenzozanna.com` -> service `lorenzozanna-edge`, environment `production`, enabled `true`.
  - Test aggiunto: `edge/test/wrangler-config.test.mjs` blocca la configurazione attuale.
- [x] Decidere se usare unico Worker per:
  - [x] API;
  - [x] MCP;
  - [x] rendering sito.
  - Decisione 2026-07-14: fase 1 su Worker unico `lorenzozanna-edge`; route separate nello stesso runtime (`/api/*`, `/mcp`, pagine pubbliche dinamiche). La scelta e gia coperta dai test Worker locali.
- [x] Decidere endpoint MCP pubblico:
  - [x] `https://api.lorenzozanna.com/mcp`;
  - [ ] oppure `https://mcp.lorenzozanna.com/mcp`.
  - Decisione 2026-07-14: usare inizialmente `https://api.lorenzozanna.com/mcp`, perche il custom domain e gia attivo e non richiede DNS/route nuove. `mcp.lorenzozanna.com` resta possibile in fase successiva se serve separazione semantica.
- [x] Se si vuole `mcp.lorenzozanna.com`, creare route/DNS necessaria.
  - Decisione 2026-07-14: non necessario per fase 1; nessuna nuova route/DNS creata.
- [x] Eseguire deploy Worker in staging o direttamente su produzione.
  - Deploy produzione 2026-07-14: versione attiva `800d2191-d4cd-4bd1-bef2-4994b36af4a0` su custom domain `api.lorenzozanna.com`.
  - Preflight: `npm test` -> 24 test verdi; `npx wrangler deploy --dry-run` OK con binding `DB` e `ROOT_DOMAIN`.
- [x] Verificare online:
  - [x] `/api/health`;
  - [x] `/mcp initialize`;
  - [x] `/mcp tools/list`;
  - [x] `/mcp tools/call disable_section` su dati test o staging.
  - Verifica 2026-07-14: `/api/health` -> 200; root remota dichiara `/mcp`; `initialize` autenticato -> 200; `tools/list` autenticato -> `disable_section`.
  - Verifica sicura `tools/call disable_section` su produzione: non modifica dati perche D1 remoto non ha ancora `pages`; risposta JSON-RPC pulita `dynamic_schema_not_ready`.
  - Verifica `/portfolio?site=ph`: 503 esplicito `dynamic_schema_not_ready`, in attesa migration D1 reale.
  - Verifica dopo migration D1: pagina temporanea `codex-smoke` creata, `disable_section` remoto eseguito con successo su `faq`, revisione creata, cleanup completato.
- [x] Non rompere l'attuale API pubblica usata da `mcp/call-tool.mjs`.
  - Verifica 2026-07-14: `node mcp/call-tool.mjs get_public_content` OK; `GET /api/public/sites/ph/content` -> 200.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo sul deploy remoto del Worker/MCP Cloudflare. Non implementare nuovi tool. Verifica wrangler, route, rischi produzione e piano di deploy sicuro.
```

## 2. Migrazione D1 reale

Obiettivo: portare il database remoto dal modello vecchio `content_entries` al modello nuovo `pages/page_sections`.

- [x] Verificare schema D1 remoto attuale.
  - Verifica 2026-07-14: prima della migration erano presenti `sites`, `content_entries`, `change_log`, `d1_migrations`; mancavano `pages`, `page_sections`, `section_revisions`.
  - Dati reali: sito `ph`, 21 `content_entries`, migration applicate prima della fase: `0001_init.sql`, `0002_seed_ph.sql`.
- [x] Applicare migration `0003_pages_sections.sql` in locale.
- [x] Testare migration in locale.
  - Test locale temporaneo con `--persist-to %TEMP%`: `0001` + `0003` + fixture `pages/portfolio` + `0004` hanno creato `portfolio` con sezioni `hero`, `text_2`, `faq`.
  - Test suite: `npm test` -> 26 test verdi.
- [x] Applicare migration `0003_pages_sections.sql` su remoto.
  - Applicate su remoto il 2026-07-14: `0003_pages_sections.sql` e `0004_seed_pages_from_content_entries.sql`.
- [x] Creare script o comando di seed/migrazione dai contenuti esistenti:
  - [x] `pages/home`;
  - [x] `pages/chi-sono`;
  - [x] `pages/portfolio`;
  - [x] `pages/contatti`;
  - [x] sezioni `hero`;
  - [x] sezioni `text`;
  - [x] sezioni `faq`;
  - [x] sezioni `gallery` dove serve.
  - Implementazione: migration idempotente `edge/migrations/0004_seed_pages_from_content_entries.sql`, basata su `content_entries.collection = 'pages'` e array `blocks`.
  - Risultato remoto: pagine `home` 5 sezioni, `chi-sono` 5, `portfolio` 4, `contatti` 4; tipi sezione: 4 `hero`, 6 `text`, 4 `faq`, 4 `cta`. Nessun blocco `gallery` presente nei dati correnti.
- [x] Conservare `content_entries` durante la transizione.
  - Verifica 2026-07-14: `content_entries` resta a 21 righe; la `0004` usa solo `INSERT OR IGNORE` su nuove tabelle e non fa `UPDATE`/`DELETE` del modello vecchio.
- [x] Aggiungere verifica post-migrazione:
  - [x] pagina portfolio esiste;
  - [x] sezione FAQ portfolio enabled;
  - [x] renderer trova dati reali;
  - [x] nessuna perdita contenuto.
  - Verifica 2026-07-14: `portfolio/faq` enabled `1`; `GET https://api.lorenzozanna.com/portfolio?site=ph` -> HTML dinamico 200, con FAQ, senza intro spezzata da virgola.
- [x] Scrivere rollback plan della migration.
  - Rollback sicuro fase 2: non fare rollback di `content_entries`; per disattivare la migration dinamica basta servire ancora il sito statico Pages e ignorare le nuove tabelle.
  - Rollback DB se necessario: eliminare solo dati/tabelle nuove in ordine `section_revisions`, `page_sections`, `pages` e rimuovere le righe `0003`/`0004` da `d1_migrations`; nessun dato contenutistico vecchio viene toccato.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo sulla migrazione D1 reale verso pages/page_sections/section_revisions. Voglio piano sicuro, script di migrazione dai content_entries attuali e rollback.
```

## 3. Rendere ph.lorenzozanna.com dinamico

Obiettivo: il dominio pubblico deve leggere D1/R2 a runtime, non servire HTML statico vecchio.

- [x] Decidere se sostituire Cloudflare Pages con Worker route.
  - Decisione 2026-07-14: Worker route path-specifiche solo per HTML pubblico; Cloudflare Pages resta attivo per asset statici.
- [x] Verificare configurazione attuale `ph.lorenzozanna.com`.
  - Verifica 2026-07-14: progetto Pages `lorenzozanna-ph` con dominio `ph.lorenzozanna.com`; DNS Cloudflare risolve correttamente; route Worker pubblicate sullo stesso host per i path HTML.
- [x] Mappare route pubbliche richieste:
  - [x] `/`;
  - [x] `/index.html`;
  - [x] `/portfolio`;
  - [x] `/portfolio.html`;
  - [x] `/about`;
  - [x] `/about.html`;
  - [x] `/contact`;
  - [x] `/contact.html`.
  - Smoke 2026-07-14: tutte le 8 route rispondono `200 text/html; charset=utf-8`.
- [x] Estendere renderer oltre `portfolio`.
  - Implementazione 2026-07-14: root `ph` -> `home`; alias pubblici `about` -> `chi-sono` e `contact` -> `contatti`; shell comune con header/footer e asset CSS/JS.
- [x] Renderizzare asset CSS/JS/immagini esistenti senza rompere layout.
  - Implementazione 2026-07-14: HTML dinamico linka `assets/css/base.css`, CSS pagina, `assets/js/main.js`; portfolio include `assets/js/gallery.js`, lightbox e sezione `gallery` da D1.
  - Migration additiva `0005_seed_portfolio_gallery_from_content_entries.sql`: copia `content_entries portfolio/series` in `page_sections.gallery` senza modificare dati legacy.
  - Smoke 2026-07-14: D1 `section_ph_portfolio_gallery` enabled, order `25`, 4 gruppi; `/portfolio` contiene `masonry-gallery` e immagini; `/assets/images/portfolio/ritratti/ritratto-riflesso.jpg` -> `200 image/jpeg`.
  - Fix regressione 2026-07-14: il renderer pubblico non deve usare solo `type` generico (`hero`, `text`, `faq`), ma `styleContract` reali. Aggiunti renderer/test per `home.hero`, `home.selected_work`, `home.split_section`, `about.hero`, `about.manifesto`, `about.values_grid`, `contact.hero`, `contact.availability`, `portfolio.page_hero`; fallback statici per immagini/link/layout gia presenti nel sito.
  - Deploy fix 2026-07-14: Worker versione `7592ba23-35df-4e69-8548-d6adb4a17afa`; verifica live HTML/browser su `/`, `/about`, `/contact`, `/portfolio` con asset immagini caricati e classi CSS specialistiche presenti.
  - Fix parita statico/dinamico 2026-07-14: `portfolio/text_2` non usa piu il fallback `<section class="section">`, ma `portfolio.series_text` con markup `editorial-section` e CSS dedicato; il renderer dinamico ora ripristina meta description/OG dagli statici locali.
  - Deploy parita 2026-07-14: Worker versione `591ebbb6-aaef-4986-9b5f-570e097b6424`; Pages deploy `https://a037123a.lorenzozanna-ph.pages.dev` per `assets/css/base.css`; smoke live su `/portfolio`, `/` e `/assets/css/base.css` passato.
  - Fix contratto `contact-band` 2026-07-15: il blocco contatti deve essere una `page_sections` reale (`sectionId=contact-band`, `styleContract=contact.band`), non markup fisso dentro `contact.hero`. Aggiunta migration `0008_seed_contact_band.sql`, renderer da `section.data.channels`, test su `get_page`, `update_text`, `update_cta` e HTML dinamico.
  - Deploy `contact-band` 2026-07-15: D1 migration `0008_seed_contact_band.sql` applicata, Worker versione `53f6867c-df53-4e3c-ad6c-58f97cbbf2c0`, Pages deploy `https://4118842f.lorenzozanna-ph.pages.dev`; smoke live `/contact`, CSS Pages, D1 remoto e MCP `get_page` su `contatti/contact-band` passati.
  - UX MCP `contact-band` 2026-07-15: aggiunto `channels[].enabled` e tool `update_contact_channel`, cosi un client AI puo dire/modificare "email", "Instagram", "telefono" e nascondere singole voci senza conoscere `channels[0]`.
  - Deploy UX MCP `contact-band` 2026-07-15: Worker versione `018d2c32-c669-4b94-b4ef-31ee446b05ac`; suite `edge` 100/100; smoke MCP `tools/list` espone `update_contact_channel`. Modifica live applicata via MCP: email `zannafotografia@icloud.com`, Instagram/Telefono `enabled:false`; `/contact` renderizza solo l'email.
  - Compat ChatGPT `update_contact_channel` 2026-07-15: semplificato lo schema MCP del tool (`href` solo `string` opzionale, `channel` enum `email|instagram|telefono`) per evitare che client rigidi scartino il tool. Worker versione `daf46dc7-4b36-472e-aab9-7674a36af7ea`; smoke live `tools/list` conferma schema nuovo dopo breve propagazione.
  - Fallback compat `channels[].enabled` 2026-07-15: `update_text` ora accetta campi booleani dichiarati nel contratto e interpreta `true/false`, `abilita/nascondi`, ecc. Worker versione `8ead3dcf-9ec3-4b46-9fd2-998edc19a57f`; suite `edge` 103/103; telefono abilitato live via `update_text` (`channels[2].enabled = true`), `/contact` mostra email e telefono, Instagram resta nascosto.
  - Fix link telefono `contact-band` 2026-07-15: il valore di un canale telefono genera automaticamente `href: "tel:..."` sia nel renderer sia negli update MCP (`update_text`, `update_contact_channel`), cosi cambiare il numero in linguaggio naturale rende subito cliccabile la chiamata. Worker versione `7538cace-2ce4-498d-8ab2-3bfa6b61c951`; suite `edge` 105/105; smoke live `/contact` e D1 remoto confermano `href="tel:123123123"`.
- [x] Decidere dove servire asset statici:
  - [x] Pages per asset;
  - [ ] Worker static assets;
  - [ ] R2;
  - [x] mantenere Pages solo per asset e Worker per HTML.
  - Decisione 2026-07-14: asset statici ancora da Pages con cache pubblica; HTML dinamico dal Worker.
- [x] Configurare cache HTML:
  - [x] `no-store` in prima fase;
  - [ ] oppure cache breve con invalidazione.
  - Smoke 2026-07-14: `GET` e `HEAD https://ph.lorenzozanna.com/portfolio` -> `200`, `Cache-Control: no-store`.
- [x] Verificare che modifica D1 sia visibile al refresh.
  - Verifica 2026-07-14: marker temporaneo su CTA portfolio apparso su `https://ph.lorenzozanna.com/portfolio`, poi ripristinato e scomparso; dati CTA tornati al valore originale.
- [x] Verificare che il vecchio HTML statico non venga piu servito.
  - Verifica 2026-07-14: path HTML coperti da Worker route, header `no-store`, markup dinamico con `data-section-id`; Pages continua a servire solo asset.
  - Deploy Worker finale fase 3: versione `d485a63d-ba90-4a1f-94ac-10806d2eaebf`.
  - Anti-regressione: `/api/health` OK e `node mcp/call-tool.mjs get_public_content` OK dopo deploy.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo su come rendere ph.lorenzozanna.com dinamico da D1, mantenendo template/CSS sicuri e zero redeploy per i contenuti.
```

## 4. Auth definitiva per Lorenzo

Obiettivo: Lorenzo deve collegarsi da un client AI compatibile senza incollare segreti nel prompt. ChatGPT e Claude sono target importanti, ma l'architettura preferita e MCP provider-neutral.

- [x] Decidere auth iniziale:
  - [x] token personale scoped;
  - [x] OAuth MVP per ChatGPT/client PKCE;
  - [ ] OAuth completo con client registry/refresh/revoca UI;
  - [ ] magic link + token.
  - Decisione 2026-07-14: partire con bearer token personale scoped e hashato in D1. OAuth resta necessario per ChatGPT App nativa/pubblicabile e per altri client che richiedono discovery/authorization metadata.
- [x] Definire ruoli:
  - [x] owner;
  - [x] editor;
  - [x] publisher;
  - [x] viewer.
  - Implementazione 2026-07-14: mapping ruolo -> scope in `edge/src/auth.mjs`.
- [x] Creare tabella/token store se necessario.
  - Implementazione 2026-07-14: migration `edge/migrations/0006_auth_tokens.sql`, con `token_hash` unico e nessun token plaintext.
- [x] Implementare token revocabile.
  - Test 2026-07-14: token `status = 'revoked'` respinto con 401.
- [x] Associare token a site slug `ph`.
  - Implementazione 2026-07-14: `auth_tokens.site_id` -> `sites.id`; il controllo permessi verifica anche il sito della richiesta.
- [x] Loggare actor reale.
  - Test 2026-07-14: `disable_section` via token utente scrive `lorenzo` in `section_revisions` e `change_log`.
- [x] Separare token tecnico `AI_API_TOKEN` da token utente Lorenzo.
  - Implementazione 2026-07-14: `AI_API_TOKEN` resta percorso tecnico `technical-token`; i token utente passano da `auth_tokens`.
- [x] Bloccare scritture MCP contenuti con token tecnico.
  - Implementazione 2026-07-15: `technical-token` mantiene solo `content:read`; `content:write` richiede token utente scoped. Gli amministratori restano tali via Cloudflare/D1/deploy/API privata, ma i connector AI non usano il token tecnico per modifiche editoriali.
  - Test 2026-07-15: `npm test` in `edge/` -> 89 test verdi; coperto `POST /mcp tools/call rejects technical token for content write tools`.
  - Deploy 2026-07-15: Worker versione `4f6a37af-16f7-439c-9830-aff7cfa9465d`.
  - Smoke remoto sicuro 2026-07-15: `AI_API_TOKEN` legge `get_page` su `ph/portfolio` -> 5 sezioni; `tools/call disable_section` con token tecnico su pagina inesistente -> JSON-RPC `-32003 Permission denied for content:write` prima di qualunque mutazione. Smoke write mutativo con token utente su D1 live non eseguito per evitare fixture/mutazioni produzione senza autorizzazione esplicita; coperto localmente dai test.
- [x] Provisionare token personale Lorenzo per primo connector AI.
  - Provisioning 2026-07-15: token registrato in D1 come `token_lorenzo_editor_20260715`, actor `lorenzo`, ruolo `editor`, scope `content:read` e `content:write`, site `ph`.
  - Segreto locale: token in chiaro solo in `.secrets/lorenzo-mcp-token.txt`, hash di controllo in `.secrets/lorenzo-mcp-token.sha256.txt`; `.secrets/` ignorata da git.
  - Smoke remoto non mutativo 2026-07-15: token Lorenzo `get_page` su `ph/portfolio` -> 5 sezioni; `disable_section` su pagina inesistente -> `Page not found`, quindi `content:write` passa senza mutare contenuti reali.
- [x] Definire istruzioni onboarding per:
  - [x] Claude custom connector;
  - [x] ChatGPT app/connector;
  - [x] client MCP generico.
  - Documento: `MCP_AUTH_ONBOARDING.md`.
- [x] Documentare cosa Lorenzo non deve fare:
  - [x] non incollare segreti in chat;
  - [x] non condividere token master;
  - [x] revocare token se compromesso.
  - Documento: `MCP_AUTH_ONBOARDING.md`.
- [x] Pubblicare discovery OAuth/MCP provider-neutral.
  - [x] `GET /.well-known/oauth-protected-resource`;
  - [x] `GET /.well-known/oauth-authorization-server`;
  - [x] `WWW-Authenticate` sui 401 MCP con `resource_metadata`;
  - [x] `securitySchemes` OAuth2 sui tool MCP.
  - Implementazione 2026-07-14: `edge/src/oauth-metadata.mjs`, route well-known in `edge/src/index.mjs`, challenge in `edge/src/auth.mjs`, security schemes in `edge/src/mcp-http.mjs`.
  - Test 2026-07-14: `npm test` in `edge/` -> 88 test verdi.
  - Deploy 2026-07-14: Worker versione `68f9b8de-ceb6-4ac9-9183-c87530762580`.
  - Smoke remoto 2026-07-14: `/.well-known/oauth-protected-resource` -> 200 con resource `https://api.lorenzozanna.com/mcp`; `/.well-known/oauth-authorization-server` -> 200 con issuer `https://api.lorenzozanna.com`, authorization/token endpoint; `/mcp` senza token -> 401 con `WWW-Authenticate: Bearer resource_metadata=...`; `tools/list` autenticato espone `securitySchemes` read/write`. Nota storica: in quel momento `/oauth/authorize` era ancora 501; dal 2026-07-15 risponde con il flusso OAuth MVP.
- [x] Implementare OAuth authorization-code flow MVP.
  - [x] login Lorenzo MVP con password via secret `LORENZO_OAUTH_PASSWORD`;
  - [x] client pre-registrato `chatgpt-lorenzo-dev`;
  - [x] authorization endpoint con PKCE S256;
  - [x] token endpoint;
  - [x] access token audience/resource binding;
  - [x] expiry access token 1 ora;
  - [x] storage D1 con hash di authorization code e access token, nessun segreto in chiaro.
  - Implementazione 2026-07-15: `edge/src/oauth.mjs`, migration `edge/migrations/0007_oauth_mvp.sql`, integrazione OAuth token in `edge/src/auth.mjs`.
  - Test 2026-07-15: `npm test` in `edge/` -> 92 test verdi; coperti pagina login/consenso, code exchange PKCE, rifiuto verifier errato, MCP con access token OAuth.
  - Deploy 2026-07-15: Worker versione finale `930004f2-0d0d-4085-a689-8262fc9032f2`; migration remota `0007_oauth_mvp.sql`; secret Worker `LORENZO_OAUTH_PASSWORD`.
  - Smoke remoto 2026-07-15: authorize -> `302` verso `https://chatgpt.com/connector/oauth/...`; token endpoint -> `200` Bearer 3600s; MCP `get_page` con access token OAuth su `ph/portfolio` -> 5 sezioni; cleanup righe smoke D1 confermato.
- [ ] Completare OAuth oltre MVP.
  - [ ] tabella/registry OAuth client;
  - [ ] magic link, passkey, passwordless email, o provider esterno;
  - [ ] refresh token;
  - [ ] endpoint revoca;
  - [ ] UI admin/revoca sessioni;
  - [ ] dynamic client registration o CIMD;
  - [ ] eventuale ID token / OIDC se richiesto dal client.

Nota 2026-07-14: fase 4 chiusa per token personale scoped. La direzione architetturale preferita e provider-neutral: il MCP di Lorenzo deve restare utilizzabile da qualunque client AI compatibile. Per ChatGPT nativo va pianificata una fase OAuth dedicata con protected resource metadata e authorization server metadata, ma come layer standard di compatibilita, non come architettura ChatGPT-specifica.
Verifica 2026-07-14:
- Test locali: `npm test` in `edge/` -> 39 test verdi.
- Migration remota applicata: `0006_auth_tokens.sql`.
- Deploy Worker: versione `9fdf6813-be9f-422d-86ca-f222058a522b`.
- Smoke tecnico: `AI_API_TOKEN` continua a chiamare `/mcp tools/list`.
- Smoke token utente D1: token temporaneo `editor` accettato da `/mcp tools/list`, `last_used_at` aggiornato, riga temporanea cancellata; token smoke rimasti: `0`.

Nota 2026-07-15, OAuth MVP: metadata, login/consenso, PKCE S256, token endpoint e validazione access token MCP sono attivi per `chatgpt-lorenzo-dev`. Resta fuori dall'MVP la parte da prodotto maturo: refresh token, revoca self-service, client registry/DCR/CIMD e login passwordless/passkey.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo su auth e onboarding Lorenzo per remote MCP. Voglio una soluzione sicura ma semplice, con token scoped o OAuth, revoca, ruoli e istruzioni per Claude/ChatGPT.
```

## 5. Tool MCP contenuti

Obiettivo: ampliare i tool oltre `disable_section`.

Nota 2026-07-14: i tool contenutistici devono usare i contratti in `MCP_SECTION_CONTRACTS.md`. Il tipo logico (`hero`, `text`, `faq`, `cta`, `gallery`) non basta: ogni sezione deve esporre anche `styleContract`, campi editabili, primitive dati e vincoli di rendering.

Nota 2026-07-15: ogni blocco visibile negli HTML statici/reference deve essere o una sezione D1 autonoma con contratto esplicito, oppure un gruppo dichiarato dentro un contratto piu grande. Non lasciare blocchi speciali renderizzati come markup fisso non esposto da `get_page`; il caso `contact-band` e stato corretto con `contatti/contact-band -> contact.band`.

Nota 2026-07-15 UX tool: quando una sezione contiene item con significato umano stabile, non basta esporre solo path tipo `channels[0].value`. Aggiungere anche un tool semantico itemizzato. Caso corretto: `update_contact_channel` per `email`, `instagram`, `telefono`, con `enabled` per hide/show.

- [x] `get_page`
  - [x] leggere pagina;
  - [x] sezioni;
  - [x] stato enabled/disabled;
  - [x] output pensato per AI.
  - [x] includere `styleContract` per ogni sezione;
  - [x] includere `editableFields` con `kind`, `path`, limiti e tool consigliato.
  - Implementazione 2026-07-14: `edge/src/pages.mjs`, `edge/src/page-contracts.mjs`, tool MCP `get_page`; permesso richiesto `content:read`.
  - Test 2026-07-14: viewer token puo chiamare `get_page`; `tools/list` espone `get_page`, `disable_section` e `enable_section`.
  - Deploy 2026-07-14: Worker versione `486a465e-6eaf-4275-8fee-c1031b4c2b87`.
  - Smoke remoto 2026-07-14: `/mcp tools/list` -> `get_page`, `disable_section`, `enable_section`; `/mcp tools/call get_page` su `ph/portfolio` -> 5 sezioni, `hero` con `portfolio.page_hero`, `gallery` con `portfolio.gallery`.
- [x] `enable_section`
  - [x] riattivare sezione;
  - [x] creare revisione;
  - [x] loggare change.
  - Implementazione 2026-07-14: `edge/src/sections.mjs` espone `enableSection`; `edge/src/mcp-http.mjs` espone il tool MCP `enable_section` con permesso `content:write`.
  - Test 2026-07-14: dominio e MCP HTTP coperti; la suite `npm test` in `edge` passa con 46 test.
  - Deploy 2026-07-14: Worker versione `41a2d412-19e5-4773-ae67-e264ed4d3793`.
  - Smoke remoto 2026-07-14: pagina temporanea `codex-enable-smoke` creata con FAQ disabilitata; `tools/call enable_section` -> `enabled: true`; D1 verificato con `enabled = 1`, `section_revisions.action = enable_section`, `change_log.action = enable_section`; cleanup completato.
- [x] `update_text`
  - [x] aggiornare campi testuali semplici;
  - [x] validare lunghezze;
  - [x] impedire HTML arbitrario.
  - Implementazione 2026-07-14: `edge/src/sections.mjs` espone `updateText`; `edge/src/page-contracts.mjs` risolve path concreti contro contratti wildcard tipo `items[].question`; `edge/src/mcp-http.mjs` espone il tool MCP `update_text` con permesso `content:write`.
  - Contratto: accetta campi `plain_text`/`text_list` e fallback plain su campi `rich_text` solo quando il contratto espone `plainTextTool: "update_text"`; non abilita ancora bold/italic/link.
  - Test 2026-07-14: dominio, resolver contratti e MCP HTTP coperti; la suite `npm test` in `edge` passa con 52 test.
  - Deploy 2026-07-14: Worker versione `9f35c365-7a72-4a47-b47b-72816065af98`.
  - Smoke remoto 2026-07-14: pagina temporanea `codex-update-smoke` creata; `tools/list` -> `get_page`, `disable_section`, `enable_section`, `update_text`; `tools/call update_text` su `hero.title` -> `Smoke Updated`; D1 verificato con JSON aggiornato, `section_revisions.action = update_text`, `change_log.action = update_text`; cleanup completato.
- [x] `update_rich_text`
  - [x] bold;
  - [x] italic;
  - [x] link;
  - [x] sanitizzazione.
  - [x] usare `rich_text_v1` con `marks[]`, non HTML libero.
  - Implementazione 2026-07-14: `edge/src/sections.mjs` espone `updateRichText`; `edge/src/rendering.mjs` renderizza `rich_text_v1` in `<strong>`, `<em>` e `<a>` escapando il testo; `edge/src/mcp-http.mjs` espone il tool MCP con permesso `content:write`.
  - Contratto: solo blocchi `paragraph`, span con `marks: ["bold"|"italic"]`, link validati con la stessa allowlist CTA; niente HTML/classi/attributi custom. La rimozione link avviene sostituendo il valore rich text con span senza `link`.
  - Test 2026-07-14: dominio, renderer e MCP HTTP coperti; la suite `npm test` in `edge` passa con 65 test.
  - Deploy 2026-07-14: Worker versione `42244168-ddaf-441a-8ba1-146c06e7ae84`.
  - Smoke remoto 2026-07-14: fixture temporaneo `codex-cta-rich-smoke`; `tools/list` espone `update_rich_text`; `tools/call update_rich_text` scrive `rich_text_v1`, D1 conferma mark/link, renderer live via `https://api.lorenzozanna.com/codex-cta-rich-smoke?site=ph` produce `<strong>`, `<em>` e link; cleanup completato.
- [x] `update_cta`
  - [x] label;
  - [x] href;
  - [x] validazione URL.
  - Implementazione 2026-07-14: `edge/src/sections.mjs` espone `updateCta`; path validati contro `editableFields` di tipo `link`; `edge/src/mcp-http.mjs` espone il tool MCP con permesso `content:write`.
  - Contratto: label plain text senza HTML; href interno `/...`, relativo allowlisted (`index.html`, `portfolio.html`, `about.html`, `contact.html`), `https://`, `mailto:`, `tel:`; vietati HTML, `..`, `javascript:`, `data:`.
  - Test 2026-07-14: dominio e MCP HTTP coperti; `update_cta` aggiorna D1 e HTML dinamico home nei test locali.
  - Smoke remoto 2026-07-14: `tools/call update_cta` su fixture temporaneo scrive label/href e crea revision/change log; prova controllata su `home/hero.primaryCta` visibile su `https://ph.lorenzozanna.com/`, poi JSON sezione ripristinato e revision/log smoke rimossi.
- [x] `list_changes`
  - [x] leggere log;
  - [x] filtrare per pagina/sezione.
  - Implementazione 2026-07-14: `edge/src/changes.mjs` espone `listChanges`; `edge/src/mcp-http.mjs` espone il tool MCP con permesso `content:read`.
  - Contratto: `site` obbligatorio; `page`, `sectionId`, `limit` opzionali; `sectionId` richiede `page`; `limit` massimo 50.
  - Output: `changes[]` con `id`, `actor`, `action`, `target`, `page`, `sectionId`, `path`, `before`, `after`, `createdAt`.
  - Test 2026-07-14: dominio e MCP HTTP coperti; viewer token puo chiamare `list_changes`; suite `npm test` in `edge` -> 70 test verdi.
  - Deploy 2026-07-14: Worker versione `77dd3b42-f24c-4b66-aaf0-e0ac0b9929e9`.
  - Smoke remoto 2026-07-14: `tools/list` espone `list_changes`; `tools/call list_changes` filtrato su `ph/portfolio/faq` risponde correttamente; chiamata non filtrata `limit=5` legge 5 cambi reali da `change_log`.
- [x] `rollback_change`
  - [x] rollback ultimo cambio;
  - [x] rollback a revisione specifica.
  - Implementazione 2026-07-14: `edge/src/rollback.mjs` espone `rollbackChange`; `edge/src/mcp-http.mjs` espone il tool MCP con permesso `content:write`.
  - Contratto: accetta `site` piu uno tra `changeId`, `revisionId`, oppure `page`/`sectionId` per annullare l'ultimo cambio filtrato.
  - Sicurezza: applica lo snapshot `before` solo se lo stato corrente della sezione coincide con lo snapshot `after` del cambio/revisione; se nel frattempo ci sono modifiche successive, il rollback si ferma.
  - Output: `rolledBackChangeId`, `rolledBackRevisionId`, `rolledBackAction`, `revisionId`, `previewUrl`, `published`.
  - Test 2026-07-14: dominio e MCP HTTP coperti; rollback testo, rollback visibility, rollback ultimo cambio, rollback a `revisionId`, protezione stale; suite `npm test` in `edge` -> 76 test verdi.
  - Deploy 2026-07-14: Worker versione `7d7e2bee-de60-4222-a373-5f84b4f80ed7`.
  - Smoke remoto 2026-07-14: fixture temporanea `codex-rollback-smoke`; `update_text` cambia titolo in `Smoke Changed`; `rollback_change` su ultimo cambio ripristina `Smoke Original`; fixture e log smoke rimossi.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo sui prossimi tool MCP contenutistici dopo disable_section: get_page, enable_section, update_text, rich text controllato, update_cta, list_changes e rollback.
```

## 6. FAQ e sezioni preimpostate

Obiettivo: Lorenzo puo aggiungere o togliere sezioni solo da preset sicuri.

- [x] Definire preset `faq`.
- [x] Definire preset `text`.
- [x] Definire preset `cta`.
- [x] Definire preset `gallery`.
- [x] Definire preset `image_text`.
- [x] Tool `list_section_presets`.
- [x] Tool `add_section_from_preset`.
- [x] Tool `add_faq_section`.
- [x] Tool `add_faq_item`.
- [x] Tool `update_faq_item`.
- [x] Tool `remove_faq_item`.
- [x] Tool `reorder_faq_items`.
- [x] Testare pagina senza FAQ -> aggiunta FAQ.
- [x] Testare pagina con FAQ -> niente duplicato non voluto.
- [x] Testare disattivazione FAQ senza cancellazione.
  - Implementazione 2026-07-14: `edge/src/section-presets.mjs` espone preset sicuri `faq`, `text`, `cta`, `gallery`, `image_text`; `gallery` e `image_text` restano non addable finche non ci sono media pipeline/renderer dedicato.
  - Implementazione 2026-07-14: `add_section_from_preset` supporta `faq` in v1 e rifiuta preset sconosciuti o non ancora addable; i tool FAQ dedicati manipolano solo JSON strutturato e rifiutano HTML.
  - Test 2026-07-14: suite `npm test` in `edge` passa con 85 test; coperti `list_section_presets`, pagina senza FAQ -> `add_faq_section`, FAQ esistente disabilitata -> riabilitazione senza duplicato, FAQ vuota, item add/update/remove/reorder, rifiuto HTML e rifiuto preset arbitrari.
  - Deploy 2026-07-14: Worker versione `5ca0affc-0d5e-4491-8742-74e0d6ab59d3`.
  - Smoke remoto 2026-07-14: fixture `codex-faq-preset-smoke`; `tools/list` espone `list_section_presets` e `add_faq_section`; `list_section_presets` -> `faq,text,cta,gallery,image_text`; `add_faq_section` -> `created: true`, `sectionId: faq`, `itemCount: 1`, `revisionId` presente; render live della fixture contiene `data-section-id="faq"` e la domanda; cleanup D1 completato con `smoke_pages = 0`, `smoke_sections = 0`, `smoke_changes = 0`.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo su preset sezioni e workflow FAQ sicuro via MCP. Le AI non devono generare HTML libero.
```

## 7. Immagini e R2/media pipeline

Obiettivo: gestire upload e sostituzione immagini senza modificare HTML.

- [ ] Decidere storage:
  - [ ] R2 puro;
  - [ ] Cloudflare Images;
  - [ ] R2 + servizio trasformazioni.
- [ ] Disegnare tabella `media_assets`.
- [ ] Creare bucket R2 se necessario.
- [ ] Tool `create_image_upload`.
- [ ] Tool `confirm_image_upload`.
- [ ] Tool `replace_image`.
- [ ] Tool `attach_image_to_section`.
- [ ] Tool `update_image_alt`.
- [ ] Tool `set_image_focal_point`.
- [ ] Tool `remove_image_from_section`.
- [ ] Validare:
  - [ ] formato file;
  - [ ] dimensione massima;
  - [ ] alt text obbligatorio;
  - [ ] ownership site;
  - [ ] virus/security se applicabile.
- [ ] Renderizzare immagini da media metadata.
- [ ] Rollback immagine.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo sulla gestione immagini via MCP: R2, upload sicuro, alt text, focal point, replace_image e rollback.
```

## 8. Rollback, preview e publish

Obiettivo: rendere modifiche sicure e reversibili.

- [ ] Decidere modalita:
  - [ ] fast mode: live subito + rollback;
  - [ ] safe mode: draft -> preview -> publish.
- [ ] Implementare `preview_change`.
- [ ] Implementare `validate_change`.
- [ ] Implementare `publish_change` se serve.
- [x] Implementare `rollback_change`.
- [ ] UI/API preview URL.
- [ ] Testare rollback:
  - [x] sezione enabled/disabled;
  - [x] testo;
  - [ ] FAQ;
  - [ ] immagine.
- [ ] Change summary leggibile per AI.
- [ ] Log completo con actor.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo su preview, publish e rollback. Voglio decidere fast mode vs safe mode e implementare rollback affidabile.
```

## 9. Test con client AI reali

Obiettivo: verificare client reali, non solo test locali.

- [x] Testare endpoint MCP con MCP Inspector o client equivalente.
- [x] Testare schema `initialize`.
- [x] Testare `tools/list`.
- [x] Testare `tools/call disable_section`.
- [ ] Testare Claude custom connector.
- [ ] Testare ChatGPT app/connector se disponibile.
- [x] Testare almeno un client MCP generico con bearer token.
- [x] Mantenere la compatibilita provider-neutral: nessun tool o permesso deve dipendere dal nome del provider AI.
  - Verifica 2026-07-14: client Node generico JSON-RPC su endpoint remoto `/mcp` con bearer token tecnico, header `Accept: application/json, text/event-stream` e `mcp-protocol-version: 2025-06-18`.
  - Risultato 2026-07-14: `initialize` -> `protocolVersion: 2025-06-18`, server `lorenzozanna-content` `0.2.0`; `tools/list` -> 8 tool (`get_page`, `list_changes`, `disable_section`, `enable_section`, `update_text`, `update_cta`, `update_rich_text`, `rollback_change`); `get_page` su `ph/portfolio` -> 5 sezioni; `list_changes` -> 3 cambi; `disable_section` su fixture temporanea `codex-generic-client-smoke/faq` -> `enabled: false` e `revisionId` presente.
  - Verifica D1 2026-07-14: section fixture `enabled = 0`; `change_log` con action `disable_section`, actor `generic-node-smoke`, target `pages/codex-generic-client-smoke/sections/faq`; cleanup completato con `smoke_pages = 0`, `smoke_sections = 0`, `smoke_changes = 0`.
  - Verifica provider-neutral 2026-07-14: `rg` su `edge/src`, `edge/test` e `edge/migrations` non trova riferimenti a ChatGPT, Claude, OpenAI, Anthropic o provider specifici; i nomi dei provider restano solo nella documentazione di compatibilita/onboarding.
  - Nota: MCP Inspector CLI non eseguito in questo passaggio per evitare dipendenze/interazioni non necessarie; resta aperto come verifica manuale/interattiva insieme a Claude e ChatGPT.
- [ ] Documentare limiti piano Free/Pro.
- [x] Scrivere guida per Lorenzo:
  - [x] URL MCP;
  - [x] come autenticarsi;
  - [x] prompt naturali;
  - [x] cosa puo modificare;
  - [x] come annullare un cambio.
  - Documento: `MCP_LORENZO_CONNECTOR_HANDOFF.md`.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo sui test con client MCP reali: MCP Inspector, Claude e ChatGPT. Voglio capire compatibilita, limiti e istruzioni operative per Lorenzo.
```

## 10. Consolidamento e pulizia repository

Obiettivo: non perdere lavoro e non committare materiale sbagliato.

- [x] Decidere destino modifiche HTML/CSS locali non ancora committate.
  - Decisione 2026-07-14: tenere nel commit tecnico/visuale; rappresentano la parita dinamico/statico, il lightbox e gli asset versionati.
- [x] Decidere destino immagini ottimizzate `assets/images`.
  - Decisione 2026-07-14: tenere nel repo; sono asset runtime del sito, 20 file per circa 5 MB.
- [x] Decidere destino sorgenti pesanti `assets/portfolio`.
  - Decisione 2026-07-14: non committare; sono sorgenti fotografici/raw locali, 109 file per circa 177 MB; aggiunti a `.gitignore`.
- [x] Decidere destino audio WhatsApp.
  - Decisione 2026-07-14: non committare; materiale grezzo/personale locale; `assets/*.ogg` aggiunto a `.gitignore`.
- [x] Decidere destino `content.md` e transcript.
  - Decisione 2026-07-14: tenere `content.md` come sorgente editoriale/SEO; non committare `transcript-*.txt`, aggiunti a `.gitignore`.
- [x] Verificare `.gitignore`.
  - Aggiornato 2026-07-14 con `assets/portfolio/`, `assets/*.ogg`, `transcript-*.txt`; `.dev.vars`, `.wrangler/` e `.deploy/` erano gia esclusi.
- [ ] Separare commit contenuti da commit infrastruttura.
  - Proposta: commit 1 infrastruttura MCP/D1/auth/tools/test; commit 2 renderer/static parity/assets immagini; commit 3 docs/roadmap/onboarding.
- [x] Evitare segreti in repo.
  - Verifica 2026-07-14: scan con `rg` esclusi `.git`, `edge/.dev.vars`, raw media ignorati; nessun match per token/bearer/API key nei file candidati.
- [x] Documentare stato deploy vs stato repo.
  - Stato 2026-07-14: Worker remoto gia deployato con `rollback_change` versione `7d7e2bee-de60-4222-a373-5f84b4f80ed7`; D1 remoto verificato senza residui `codex-*`.

Prompt per chat:

```text
Leggi MCP_REMOTE_ROADMAP.md, MCP_TDD_TODO.md e MCP_NEXT_PHASES_TODO.md. Concentrati solo sulla pulizia repository e gestione dei file non committati: HTML/CSS, immagini, audio, content.md e transcript. Voglio una strategia di commit sicura.
```
