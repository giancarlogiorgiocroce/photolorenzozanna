# Lorenzo Zanna MCP

Il progetto espone due superfici MCP distinte:

1. remote MCP di produzione nel Cloudflare Worker, usato dai connector AI;
2. MCP locale `stdio`, mantenuto per compatibilita e import storici.

## Remote MCP di produzione

Endpoint:

```text
https://api.lorenzozanna.com/mcp
```

Il sito live `https://ph.lorenzozanna.com` e' dinamico: il Worker renderizza l'HTML
da D1 e risolve gli asset media da R2. Cloudflare Pages serve CSS, JavaScript e
immagini statiche, ma non e' la sorgente dell'HTML live.

Autenticazione supportata:

- bearer token personale scoped per client MCP generici;
- OAuth authorization-code + PKCE per ChatGPT e client compatibili;
- `AI_API_TOKEN` solo per lettura/smoke sul canale MCP.

La superficie remota verificata espone 30 tool, inclusi metadata, archiviazione reversibile,
rimozione, riordino e caption per le gallery. L'elenco corrente e' documentato in `../edge/README.md`;
i contratti dei campi sono in
`../MCP_SECTION_CONTRACTS.md`.

### Media

La pipeline R2 espone:

- `create_image_upload`;
- `confirm_image_upload`;
- `list_media_assets`;
- `update_media_asset`;
- `set_media_asset_archived`;
- `replace_image`;
- `attach_image_to_section`;
- `remove_image_from_section`;
- `reorder_images_in_section`;
- `update_image_caption`;
- `update_image_alt`;
- `set_image_focal_point`;
- `set_image_visibility`.

Quando un client non puo inviare i byte dell'allegato, deve mostrare
`upload.uploadPageUrl`; dopo l'upload browser chiama `confirm_image_upload` e poi
`attach_image_to_section` o `replace_image`.

Manuale operativo: `../MCP_MEDIA_PIPELINE.md`.

## MCP locale `stdio`

Il server locale non usa dipendenze esterne e legge `AI_API_TOKEN` da:

1. variabile ambiente `AI_API_TOKEN`;
2. fallback locale `edge/.dev.vars`.

Avvio:

```powershell
node mcp/lorenzozanna-server.mjs
```

Tool locali legacy:

- `get_public_content`;
- `upsert_content`;
- `list_changes`;
- `sync_content_markdown`.

Test tramite client locale:

```powershell
node mcp/call-tool.mjs get_public_content "{""site"":""ph""}"
```

Import storico da `content.md`:

```powershell
node mcp/call-tool.mjs sync_content_markdown "{""path"":""content.md"",""site"":""ph"",""publish"":true,""updateVisibleContent"":true}"
```

Il sync locale conserva le pagine pubbliche e i draft editoriali nel modello
storico `content_entries`. Non e' il flusso consigliato per modificare il sito
live: l'editing ordinario deve usare i tool del remote MCP su `page_sections` e
`media_assets`, con revisioni e rollback.

## Fonti operative

- checklist unica: `../TODO.md`;
- Worker e tool remoti: `../edge/README.md`;
- media/R2: `../MCP_MEDIA_PIPELINE.md`;
- auth: `../MCP_AUTH_ONBOARDING.md`;
- onboarding Lorenzo: `../MCP_LORENZO_CONNECTOR_HANDOFF.md`.
