# Handoff connector AI Lorenzo

Data: 2026-07-15

## Stato

La parte server e pronta per una prova reale con un client AI che supporta remote MCP con bearer token.

Endpoint MCP:

```text
https://api.lorenzozanna.com/mcp
```

Autenticazione:

```text
Authorization: Bearer <TOKEN_PERSONALE_LORENZO>
```

Il token personale e gia stato creato e registrato su D1:

- id D1: `token_lorenzo_editor_20260715`
- actor: `lorenzo`
- ruolo: `editor`
- scope: `content:read`, `content:write`
- site: `ph`
- stato: `active`
- token in chiaro: `.secrets/lorenzo-mcp-token.txt`
- hash locale di controllo: `.secrets/lorenzo-mcp-token.sha256.txt`

I file in `.secrets/` sono ignorati da git. Non incollare il token in chat, issue, documenti versionati o screenshot.

## Verifica gia fatta

Con il token di Lorenzo:

- `get_page` su `ph/portfolio` risponde 200 e legge 5 sezioni.
- `disable_section` su una pagina inesistente risponde `Page not found`, non `Permission denied`. Questo prova che il token ha `content:write` senza modificare dati reali.

## Cosa preparare nel client AI

Per client MCP generici che accettano bearer token:

1. Configurare un remote MCP server con URL `https://api.lorenzozanna.com/mcp`.
2. Inserire il token dal file `.secrets/lorenzo-mcp-token.txt` nel campo segreto/credenziale.
3. Impostare il metodo auth come bearer token o header custom `Authorization`.
4. Fare un primo test con `tools/list` o con una richiesta naturale tipo "Mostrami le sezioni del portfolio".

Per ChatGPT developer-mode app / connector OAuth:

```text
MCP server URL: https://api.lorenzozanna.com/mcp
OAuth Client ID: chatgpt-lorenzo-dev
Client secret: lasciare vuoto / none
Scopes: content:read content:write
Authorization URL: https://api.lorenzozanna.com/oauth/authorize
Token URL: https://api.lorenzozanna.com/oauth/token
Resource: https://api.lorenzozanna.com/mcp
```

Se ChatGPT mostra la callback/redirect URI, non va copiata in codice: il server accetta gia `https://chatgpt.com/connector/oauth/...`.

Quando ChatGPT apre la pagina nostra di login:

```text
username: lorenzo
password: .secrets/lorenzo-oauth-password.txt
```

Non serve spiegare a Lorenzo guardrail tecnici, HTML o sicurezza dei campi: il server gia blocca HTML arbitrario e scritture fuori contratto. Lorenzo puo parlare in linguaggio naturale.

## Messaggio semplice per Lorenzo

```text
Ti ho preparato un connettore per modificare i contenuti del sito via AI.
Quando vuoi fare una prova, scrivi normalmente cose tipo:

"Mostrami le sezioni della pagina portfolio."
"Cambia la terza FAQ della homepage: domanda ..., risposta ..."
"Aggiungi una FAQ alla pagina contatti con domanda ... e risposta ..."
"Annulla l'ultimo cambio fatto alla FAQ del portfolio."

Le modifiche passano da strumenti controllati del sito, non da accesso libero all'HTML.
```

## Nota su ChatGPT, Claude e altri client

Questa architettura e provider-neutral: endpoint MCP standard piu credenziale bearer.

Un client che accetta remote MCP con bearer token puo usare il token personale. ChatGPT puo usare l'OAuth MVP: authorization-code + PKCE, access token da 1 ora, client predefinito `chatgpt-lorenzo-dev`.

Limiti MVP: non ci sono refresh token, dynamic client registration o pagina admin di revoca. Per revocare access token OAuth si interviene su D1.

`GET https://api.lorenzozanna.com/mcp` da browser puo mostrare `Method Not Allowed`: e normale. `/mcp` e un endpoint POST JSON-RPC per client MCP, non una pagina navigabile.

## Revoca

Per revocare il token:

```sql
UPDATE auth_tokens
SET
  status = 'revoked',
  revoked_at = datetime('now'),
  updated_at = datetime('now')
WHERE id = 'token_lorenzo_editor_20260715';
```
