import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("0004 seeds structured pages from content_entries without mutating legacy content", async () => {
  const sql = await readFile(
    new URL("../migrations/0004_seed_pages_from_content_entries.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /INSERT OR IGNORE INTO pages/);
  assert.match(sql, /INSERT OR IGNORE INTO page_sections/);
  assert.match(sql, /ce\.collection = 'pages'/);
  assert.match(sql, /ce\.item_key IN \('home', 'chi-sono', 'portfolio', 'contatti'\)/);
  assert.match(sql, /json_each\(ce\.data, '\$\.blocks'\)/);
  assert.match(sql, /json_extract\(block\.value, '\$\.type'\) IN \('hero', 'text', 'faq', 'cta', 'gallery'\)/);
  assert.doesNotMatch(sql, /\bUPDATE\s+content_entries\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+content_entries\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
});

test("0005 seeds portfolio gallery from legacy portfolio series without mutating legacy content", async () => {
  const sql = await readFile(
    new URL("../migrations/0005_seed_portfolio_gallery_from_content_entries.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /INSERT OR IGNORE INTO page_sections/);
  assert.match(sql, /section_ph_portfolio_gallery/);
  assert.match(sql, /section_key,\s*type,\s*section_order/s);
  assert.match(sql, /'gallery',\s*'gallery',\s*25/s);
  assert.match(sql, /ce\.collection = 'portfolio'/);
  assert.match(sql, /ce\.item_key = 'series'/);
  assert.match(sql, /json_extract\(ce\.data, '\$\.items'\)/);
  assert.match(sql, /ce\.status = 'published'/);
  assert.doesNotMatch(sql, /\bUPDATE\s+content_entries\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+content_entries\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
});

test("0006 creates scoped revocable auth tokens without storing plaintext tokens", async () => {
  const sql = await readFile(
    new URL("../migrations/0006_auth_tokens.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS auth_tokens/);
  assert.match(sql, /site_id TEXT NOT NULL/);
  assert.match(sql, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql, /actor TEXT NOT NULL/);
  assert.match(sql, /role TEXT NOT NULL/);
  assert.match(sql, /CHECK \(role IN \('owner', 'editor', 'publisher', 'viewer'\)\)/);
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'active'/);
  assert.match(sql, /CHECK \(status IN \('active', 'revoked'\)\)/);
  assert.match(sql, /scopes TEXT NOT NULL/);
  assert.match(sql, /revoked_at TEXT/);
  assert.match(sql, /FOREIGN KEY \(site_id\) REFERENCES sites\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /\btoken_plaintext\b/i);
  assert.doesNotMatch(sql, /\bsecret\b/i);
});
