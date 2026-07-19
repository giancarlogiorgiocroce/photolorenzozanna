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

test("0007 creates OAuth code and access token tables without storing plaintext credentials", async () => {
  const sql = await readFile(
    new URL("../migrations/0007_oauth_mvp.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS oauth_authorization_codes/);
  assert.match(sql, /code_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql, /code_challenge TEXT NOT NULL/);
  assert.match(sql, /code_challenge_method TEXT NOT NULL/);
  assert.match(sql, /redirect_uri TEXT NOT NULL/);
  assert.match(sql, /resource TEXT NOT NULL/);
  assert.match(sql, /expires_at TEXT NOT NULL/);
  assert.match(sql, /used_at TEXT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS oauth_access_tokens/);
  assert.match(sql, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'active'/);
  assert.match(sql, /CHECK \(status IN \('active', 'revoked'\)\)/);
  assert.match(sql, /FOREIGN KEY \(site_id\) REFERENCES sites\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /\baccess_token\b/i);
  assert.doesNotMatch(sql, /\bauthorization_code\b/i);
  assert.doesNotMatch(sql, /\bcode_verifier\b/i);
  assert.doesNotMatch(sql, /\bclient_secret\b/i);
});

test("0008 seeds the contact band as a real editable page section", async () => {
  const sql = await readFile(
    new URL("../migrations/0008_seed_contact_band.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /INSERT OR IGNORE INTO page_sections/);
  assert.match(sql, /section_ph_contatti_contact_band/);
  assert.match(sql, /'contact-band'/);
  assert.match(sql, /'text'/);
  assert.match(sql, /\b15\b/);
  assert.match(sql, /'channels'/);
  assert.match(sql, /'Email'/);
  assert.match(sql, /'Instagram'/);
  assert.match(sql, /'Telefono'/);
  assert.match(sql, /p\.slug = 'contatti'/);
  assert.match(sql, /s\.slug = 'ph'/);
  assert.doesNotMatch(sql, /\bUPDATE\s+content_entries\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+content_entries\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
});

test("0009 creates structured media asset and usage tables without plaintext secrets", async () => {
  const sql = await readFile(
    new URL("../migrations/0009_media_assets.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS media_assets/);
  assert.match(sql, /site_id TEXT NOT NULL/);
  assert.match(sql, /r2_key TEXT/);
  assert.match(sql, /public_url TEXT NOT NULL/);
  assert.match(sql, /alt TEXT NOT NULL DEFAULT ''/);
  assert.match(sql, /caption TEXT/);
  assert.match(sql, /width INTEGER NOT NULL/);
  assert.match(sql, /height INTEGER NOT NULL/);
  assert.match(sql, /mime_type TEXT NOT NULL/);
  assert.match(sql, /size_bytes INTEGER NOT NULL/);
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'ready'/);
  assert.match(sql, /CHECK \(status IN \('draft', 'ready', 'archived'\)\)/);
  assert.match(sql, /FOREIGN KEY \(site_id\) REFERENCES sites\(id\) ON DELETE CASCADE/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS media_usages/);
  assert.match(sql, /asset_id TEXT NOT NULL/);
  assert.match(sql, /page_id TEXT NOT NULL/);
  assert.match(sql, /section_id TEXT NOT NULL/);
  assert.match(sql, /path TEXT NOT NULL/);
  assert.match(sql, /UNIQUE \(page_id, section_id, path\)/);
  assert.match(sql, /FOREIGN KEY \(asset_id\) REFERENCES media_assets\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /\bsecret\b/i);
  assert.doesNotMatch(sql, /\btoken\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
});

test("0010 creates media upload sessions with hashed upload tokens", async () => {
  const sql = await readFile(
    new URL("../migrations/0010_media_uploads.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS media_uploads/);
  assert.match(sql, /site_id TEXT NOT NULL/);
  assert.match(sql, /asset_id TEXT NOT NULL UNIQUE/);
  assert.match(sql, /r2_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /filename TEXT NOT NULL/);
  assert.match(sql, /mime_type TEXT NOT NULL/);
  assert.match(sql, /size_bytes INTEGER NOT NULL/);
  assert.match(sql, /upload_token_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(sql, /CHECK \(status IN \('pending', 'uploaded', 'expired', 'cancelled'\)\)/);
  assert.match(sql, /expires_at TEXT NOT NULL/);
  assert.match(sql, /uploaded_at TEXT/);
  assert.match(sql, /FOREIGN KEY \(site_id\) REFERENCES sites\(id\) ON DELETE CASCADE/);
  assert.match(sql, /FOREIGN KEY \(asset_id\) REFERENCES media_assets\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /\bupload_token TEXT\b/i);
  assert.doesNotMatch(sql, /\btoken_plaintext\b/i);
  assert.doesNotMatch(sql, /\bsecret\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
});
