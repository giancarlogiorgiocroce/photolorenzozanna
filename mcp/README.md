# Lorenzo Zanna MCP

MCP locale per modificare i contenuti di `ph.lorenzozanna.com` passando dalla API privata gia' deployata su Cloudflare.

Il server parla stdio MCP e non usa dipendenze esterne. Legge `AI_API_TOKEN` da:

1. variabile ambiente `AI_API_TOKEN`;
2. fallback locale `edge/.dev.vars`.

## Server

```powershell
node mcp/lorenzozanna-server.mjs
```

Tool esposti:

- `get_public_content`
- `upsert_content`
- `list_changes`
- `sync_content_markdown`

## Test locale

Il client `call-tool.mjs` invoca il server via MCP stdio, quindi non chiama direttamente l'API.

```powershell
node mcp/call-tool.mjs get_public_content "{""site"":""ph""}"
```

Import da `content.md`:

```powershell
node mcp/call-tool.mjs sync_content_markdown "{""path"":""content.md"",""site"":""ph"",""publish"":true,""updateVisibleContent"":true}"
```

Questo salva solo le pagine del sito attuale come pubblicate nella collection `pages`:

- `pages/home`
- `pages/chi-sono`
- `pages/portfolio`
- `pages/contatti`

Le pagine editoriali future vengono mantenute in `draft`:

- `pages/servizi`
- `pages/servizi-ritratti`
- `pages/servizi-fotografia-commerciale`
- `pages/stampe-analogiche`
- `pages/metodo`
- `pages/faq`

`Piano SEO` non e' una pagina del sito: viene salvato come documento interno in `internal/piano-seo`, e l'eventuale vecchia entry `pages/piano-seo` viene forzata in `draft`.

Il sync aggiorna anche le entry visibili principali:

- `home/hero`
- `home/faq`
- `about/hero`
- `about/faq`
- `portfolio/series`
- `portfolio/faq`
- `contact/details`
- `contact/faq`

Nota: il sito Pages attuale resta statico. Il D1 viene aggiornato via MCP/API, ma per vedere quei testi nel sito bisogna collegare il frontend alla API o rigenerare gli HTML e redeployare Pages.
