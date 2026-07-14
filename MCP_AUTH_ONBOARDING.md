# MCP auth e onboarding Lorenzo

Data: 2026-07-14

## Decisione fase 4

La prima auth reale per Lorenzo usa token personali scoped, non OAuth completo.

Il token personale viene mostrato una sola volta a Lorenzo e salvato dal client/connector come credenziale. Nel database D1 viene salvato solo `token_hash`, mai il token in chiaro.

`AI_API_TOKEN` resta un token tecnico per smoke test, API privata e fallback operativo. Non va dato a Lorenzo e non va configurato nei connector utente.

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

Stato 2026-07-14: la discovery OAuth e pubblicata per compatibilita MCP/ChatGPT futura. I 401 dell'endpoint MCP includono `WWW-Authenticate` con `resource_metadata`, e i tool MCP dichiarano `securitySchemes` OAuth2 con scope `content:read` o `content:write`.

Il flusso OAuth completo non e ancora attivo: gli endpoint `/oauth/*` rispondono `oauth_flow_not_configured`. Per collegamenti operativi oggi, usare ancora il token personale scoped.

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

Per Lorenzo, il ruolo iniziale consigliato e `owner` se il token resta personale e custodito nel connector. Per prove con AI o collaboratori, usare `editor` o `viewer`.

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
  'token_lorenzo_owner_20260714',
  id,
  '<HASH>',
  'Lorenzo personal connector',
  'lorenzo',
  'owner',
  '["content:read","content:write","content:publish"]',
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
WHERE id = 'token_lorenzo_owner_20260714';
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

Per una ChatGPT App/connector nativo, la fase token personale non basta come soluzione definitiva pubblicabile: la documentazione OpenAI Apps SDK richiede un flusso OAuth per l'autenticazione utente, con protected resource metadata, authorization server metadata e redirect OAuth.

Questo non significa rendere l'architettura ChatGPT-specifica. Significa aggiungere OAuth standard come layer di compatibilita per i client che lo richiedono.

Stato attuale: metadata e challenge sono pronti; login/consenso OAuth, PKCE, token endpoint e revoca/expiry OAuth sono il prossimo slice.

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
- Se sospetta una compromissione, chiedere revoca e rigenerazione.

## Fonti operative

- MCP Authorization specification: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- OpenAI Apps SDK authentication: https://developers.openai.com/apps-sdk/build/auth
- OpenAI Apps SDK connect from ChatGPT: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
