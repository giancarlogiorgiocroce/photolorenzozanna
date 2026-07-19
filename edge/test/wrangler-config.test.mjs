import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wrangler.toml targets the current production API custom domain", async () => {
  const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");

  assert.match(config, /^name = "lorenzozanna-edge"$/m);
  assert.match(config, /^main = "src\/index\.mjs"$/m);
  assert.match(config, /^workers_dev = false$/m);
  assert.match(config, /\[vars\][\s\S]*ROOT_DOMAIN = "lorenzozanna\.com"/);
  assert.match(
    config,
    /\[\[d1_databases\]\][\s\S]*binding = "DB"[\s\S]*database_name = "lorenzozanna_content"[\s\S]*database_id = "909a730d-0eb9-458a-ae34-c97a597cdcc4"/,
  );
  assert.match(
    config,
    /\[\[r2_buckets\]\][\s\S]*binding = "MEDIA_BUCKET"[\s\S]*bucket_name = "lorenzozanna-media"/,
  );
  assert.match(config, /\[\[routes\]\][\s\S]*pattern = "api\.lorenzozanna\.com"[\s\S]*custom_domain = true/);
  for (const route of [
    "ph.lorenzozanna.com/",
    "ph.lorenzozanna.com/index.html",
    "ph.lorenzozanna.com/index.php",
    "ph.lorenzozanna.com/robots.txt",
    "ph.lorenzozanna.com/sitemap.xml",
    "ph.lorenzozanna.com/portfolio",
    "ph.lorenzozanna.com/portfolio.html",
    "ph.lorenzozanna.com/about",
    "ph.lorenzozanna.com/about.html",
    "ph.lorenzozanna.com/contact",
    "ph.lorenzozanna.com/contact.html",
  ]) {
    assert.match(config, new RegExp(`pattern = "${escapeRegExp(route)}"`));
  }

  assert.doesNotMatch(config, /pattern = "ph\.lorenzozanna\.com\/\*"/);
  assert.doesNotMatch(config, /pattern = "ph\.lorenzozanna\.com\/assets/);
  assert.doesNotMatch(config, /mcp\.lorenzozanna\.com/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
