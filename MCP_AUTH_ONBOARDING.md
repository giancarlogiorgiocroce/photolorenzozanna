# MCP auth e onboarding Lorenzo

Data: 2026-07-15

## Decisione fase 4

L'auth operativa per Lorenzo ora ha due canali compatibili:

- token personali scoped, utili per client MCP generici o connector che accettano bearer token diretto;
- OAuth 2.1 MVP, utile per ChatGPT e client che richiedono authorization-code + PKCE.

Il token personale viene mostrato una sola volta a Lorenzo e salvato dal client/connector come credenziale. Nel database D1 viene salvato solo `token_hash`, mai il token in chiaro.

`AI_API_TOKEN` resta un token tecnico per smoke test, API privata e fallback operativo. Non va dato a Lorenzo e non va configurato nei connector utente.

Stato 2026-07-15: sul canale MCP, `AI_API_TOKEN` e limitato a lettura/smoke (`content:read`). Non puo chiamare tool di scrittura contenuti come `disable_section`, `update_text`, `add_faq_section` o `rollback_change`. Le modifiche editoriali via MCP devono passare da un token utente scoped di Lorenzo o da un token utente esplicitamente autorizzato.

Stato operativo 2026-07-15: il token personale di Lorenzo e stato preparato e registrato su D1 come `token_lorenzo_editor_20260715`, actor `lorenzo`, ruolo `editor`, scope `content:read` e `content:write`. Il token in chiaro e solo nel file locale ignorato `.secrets/lorenzo-mcp-token.txt`; in D1 c'e solo l'hash.

Stato OAuth MVP 2026-07-15:

- client predefinito: `chatgpt-lorenzo-dev`;
- username Lorenzo: `lorenzo`;
- password locale: `.secrets/lorenzo-oauth-password.txt`;
- authorization endpoint: `https://api.lorenzozanna.com/oauth/authorize`;
- token endpoint: `https://api.lorenzozanna.com/oauth/token`;
- redirect consentiti: `https://chatgpt.com/connector/oauth/...` e legacy `https://chatgpt.com/connector_platform_oauth_redirect`;
- PKCE obbligatorio: `S256`;
- access token: hashato in D1, scadenza 1 ora, audience/resource `https://api.lorenzozanna.com/mcp`;
- niente refresh token in MVP.

Smoke remoto 2026-07-15:

- `get_page` con token Lorenzo su `ph/portfolio` -> 200, 5 sezioni.
- `disable_section` con token Lorenzo su pagina inesistente -> `Page not found`, quindi il controllo `content:write` e superato senza mutare contenuti reali.

## Architettura preferita

L'auth deve restare provider-neutral.

Il server MCP di Lorenzo non deve essere progettato "per ChatGPT" o "per Claude" in modo esclusivo. Deve esporre un endpoint MCP standard, ruoli standard e credenziali standard. ChatGPT, Claude, Codex, Cursor, client MCP generici e agenti custom sono client possibili dello stesso server.

Quando un client richiede un flusso specifico, per esempio OAuth metadata per una ChatGPT App nativa, quel supporto va aggiunto come compatibilita sopra il server MCP generico. La logica contenutistica, i ruoli e gli scope restano uguali.

## Endpoint MCP

Endpoint corrente:

```text
https://api.lorenzozanna.com/mcp
```

Header richiesto dai client che supportano bearer token:

```text
Authorization: Bearer <LORENZO_PERSONAL_TOKEN>
```

Endpoint discovery OAuth/MCP:

```text
https://api.lorenzozanna.com/.well-known/oauth-protected-resource
https://api.lorenzozanna.com/.well-known/oauth-authorization-server
```

Stato 2026-07-15: la discovery OAuth e pubblicata e il flusso authorization-code + PKCE e attivo per il client predefinito `chatgpt-lorenzo-dev`. I 401 dell'endpoint MCP includono `WWW-Authenticate` con `resource_metadata`, e i tool MCP dichiarano `securitySchemes` OAuth2 con scope `content:read` o `content:write`.

## Ruoli

```text
owner
  content:read
  content:write
  content:publish
  admin:tokens

editor
  content:read
  content:write

publisher
  content:read
  content:publish

viewer
  content:read
```

Per Lorenzo, il ruolo iniziale consigliato per la prima prova con connector AI e `editor`: puo leggere e modificare contenuti editoriali, ma non ha publish/admin token. Se in futuro serve un flusso draft -> publish, si puo passare a `owner` o aggiungere uno scope dedicato solo quando il connector e ben custodito.

Regola operativa:

```text
MCP contenuti:
  legge/smoke tecnico -> AI_API_TOKEN
  modifica contenuti -> token utente Lorenzo/editor/owner

Cloudflare, deploy, D1, API privata:
  restano canali amministrativi nostri, separati dai connector AI di Lorenzo.
```

## Generare un token

Genera token e hash fuori dalla chat:

```powershell
node -e "const crypto=require('node:crypto'); const token='lz_'+crypto.randomBytes(32).toString('base64url'); const hash=crypto.createHash('sha256').update(token).digest('hex'); console.log('TOKEN='+token); console.log('HASH='+hash);"
```

Il valore `TOKEN` va consegnato a Lorenzo tramite canale sicuro e inserito solo nel campo credenziali del connector.

Il valore `HASH` va inserito in D1:

```sql
INSERT INTO auth_tokens (
  id,
  site_id,
  token_hash,
  label,
  actor,
  role,
  scopes,
  status,
  created_at,
  updated_at
)
SELECT
  'token_lorenzo_editor_YYYYMMDD',
  id,
  '<HASH>',
  'Lorenzo editor MCP connector',
  'lorenzo',
  'editor',
  json_array('content:read','content:write'),
  'active',
  datetime('now'),
  datetime('now')
FROM sites
WHERE slug = 'ph';
```

## Revocare un token

```sql
UPDATE auth_tokens
SET
  status = 'revoked',
  revoked_at = datetime('now'),
  updated_at = datetime('now')
WHERE id = 'token_lorenzo_editor_20260715';
```

Se un token e compromesso, revocarlo subito e generarne uno nuovo con un nuovo hash.

## Claude

Quando Claude consente un custom connector o remote MCP con token bearer:

1. Crea un nuovo custom connector.
2. Usa `https://api.lorenzozanna.com/mcp` come endpoint MCP remoto.
3. Configura la credenziale come bearer token.
4. Inserisci il token nel campo segreto/credenziale del connector, non nel prompt.
5. Fai una prova con `tools/list`, poi una modifica piccola e reversibile.

## ChatGPT

Per client OpenAI/API che permettono di passare un bearer token al server MCP, usa lo stesso endpoint e lo stesso header `Authorization`.

Per una ChatGPT App/connector nativo, usare OAuth.

Configurazione MVP:

```text
MCP server URL: https://api.lorenzozanna.com/mcp
OAuth Client ID: chatgpt-lorenzo-dev
Client secret: vuoto / none
Scopes: content:read content:write
Authorization URL: https://api.lorenzozanna.com/oauth/authorize
Token URL: https://api.lorenzozanna.com/oauth/token
Resource: https://api.lorenzozanna.com/mcp
```

Quando ChatGPT apre la pagina di autorizzazione, Lorenzo deve usare:

```text
username: lorenzo
password: valore in .secrets/lorenzo-oauth-password.txt
```

Questo non rende l'architettura ChatGPT-specifica. OAuth e un layer standard di compatibilita sopra il server MCP provider-neutral.

Limiti MVP: client predefinito hardcoded, login password semplice, niente refresh token, niente dynamic client registration, niente UI di revoca. Gli access token scadono dopo 1 ora e sono validi solo per il resource MCP.

## Client MCP generico

Configurazione minima:

```json
{
  "url": "https://api.lorenzozanna.com/mcp",
  "headers": {
    "Authorization": "Bearer <LORENZO_PERSONAL_TOKEN>"
  }
}
```

Il token deve vivere nel secret store del client, non nel testo della conversazione.

## Cosa Lorenzo non deve fare

- Non incollare il token in una chat.
- Non mandare screenshot del token.
- Non condividere il token personale con collaboratori.
- Non usare `AI_API_TOKEN` nei connector.
- Non chiedere all'AI di usare token tecnici o segreti amministrativi per modificare contenuti.
- Se sospetta una compromissione, chiedere revoca e rigenerazione.

## Fonti operative

- MCP Authorization specification: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- OpenAI Apps SDK authentication: https://developers.openai.com/apps-sdk/build/auth
- OpenAI Apps SDK connect from ChatGPT: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
