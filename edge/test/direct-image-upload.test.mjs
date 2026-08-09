import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareDirectImageUpload,
} from "../src/direct-image-upload.mjs";

const FORMAT_CASES = [
  {
    name: "PNG",
    mimeType: "image/png",
    fileName: "Ritratto.PNG",
    bytes: pngHeader(640, 480),
    width: 640,
    height: 480,
  },
  {
    name: "JPEG",
    mimeType: "image/jpeg",
    fileName: "Ritratto.JPEG",
    bytes: jpegHeader(800, 600),
    width: 800,
    height: 600,
  },
  {
    name: "WebP",
    mimeType: "image/webp",
    fileName: "Ritratto.webp",
    bytes: webpHeader(1024, 768),
    width: 1024,
    height: 768,
  },
  {
    name: "AVIF",
    mimeType: "image/avif",
    fileName: "Ritratto.avif",
    bytes: avifHeader(1200, 900),
    width: 1200,
    height: 900,
  },
];

for (const format of FORMAT_CASES) {
  test(`prepareDirectImageUpload detects ${format.name} signature and dimensions`, async () => {
    const calls = [];
    const prepared = await prepareDirectImageUpload(
      {
        download_url: "https://files.openai.example/download/signed",
        file_id: `file_${format.name.toLowerCase()}`,
        mime_type: format.mimeType,
        file_name: format.fileName,
      },
      {
        fetchImpl: async (url, init) => {
          calls.push({ url, init });
          return imageResponse(format.bytes, format.mimeType);
        },
      },
    );

    const replayed = new Uint8Array(await new Response(prepared.stream).arrayBuffer());
    assert.equal(prepared.detectedMimeType, format.mimeType);
    assert.equal(prepared.width, format.width);
    assert.equal(prepared.height, format.height);
    assert.equal(prepared.declaredSizeBytes, format.bytes.byteLength);
    assert.deepEqual(replayed, format.bytes);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, "manual");
    assert.equal(calls[0].init.method, "GET");
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });
}

test("prepareDirectImageUpload follows controlled HTTPS redirects", async () => {
  const bytes = pngHeader(320, 240);
  const calls = [];
  const prepared = await prepareDirectImageUpload(
    {
      download_url: "https://files.openai.example/start",
      file_id: "file_redirect",
      mime_type: "image/png",
      file_name: "redirect.png",
    },
    {
      fetchImpl: async (url) => {
        calls.push(url);
        if (calls.length === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: "/download/final" },
          });
        }
        return imageResponse(bytes, "image/png");
      },
    },
  );

  await new Response(prepared.stream).arrayBuffer();
  assert.deepEqual(calls, [
    "https://files.openai.example/start",
    "https://files.openai.example/download/final",
  ]);
});

test("prepareDirectImageUpload treats file_id as an opaque host identifier", async () => {
  const bytes = pngHeader(320, 240);
  const fileId = "file-service://attachments/opaque+identifier==/hero contact";
  const prepared = await prepareDirectImageUpload(
    {
      download_url: "https://files.openai.example/download/opaque",
      file_id: fileId,
      mime_type: "image/png",
      file_name: "hero-contatti.png",
    },
    {
      fetchImpl: async () => imageResponse(bytes, "image/png"),
    },
  );

  await new Response(prepared.stream).arrayBuffer();
  assert.equal(prepared.fileId, fileId);
});

test("prepareDirectImageUpload rejects oversized or control-character file_id values", async () => {
  for (const fileId of ["x".repeat(2049), "file_bad\nidentifier"]) {
    await assert.rejects(
      () => prepareDirectImageUpload(
        {
          download_url: "https://files.openai.example/download/invalid-id",
          file_id: fileId,
        },
        { fetchImpl: async () => imageResponse(pngHeader(1, 1), "image/png") },
      ),
      /Invalid direct image file_id/,
    );
  }
});

test("prepareDirectImageUpload rejects redirects beyond the configured limit", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      prepareDirectImageUpload(
        {
          download_url: "https://files.openai.example/start",
          file_id: "file_redirect_limit",
        },
        {
          maxRedirects: 1,
          fetchImpl: async () => {
            calls += 1;
            return new Response(null, {
              status: 302,
              headers: { location: `/redirect/${calls}` },
            });
          },
        },
      ),
    /exceeded the redirect limit/,
  );
  assert.equal(calls, 2);
});

test("prepareDirectImageUpload rejects unsafe URLs and unsafe redirects", async () => {
  await assert.rejects(
    () =>
      prepareDirectImageUpload(
        {
          download_url: "http://files.openai.example/image.png",
          file_id: "file_http",
        },
        { fetchImpl: async () => imageResponse(pngHeader(1, 1), "image/png") },
      ),
    /must use HTTPS/,
  );

  await assert.rejects(
    () =>
      prepareDirectImageUpload(
        {
          download_url: "https://files.openai.example/image.png",
          file_id: "file_redirect_private",
        },
        {
          fetchImpl: async () => new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/private" },
          }),
        },
      ),
    /host is not allowed/,
  );
});

test("prepareDirectImageUpload rejects size, MIME, signature, and timeout failures", async () => {
  const png = pngHeader(1, 1);

  await assert.rejects(
    () =>
      prepareDirectImageUpload(
        {
          download_url: "https://files.openai.example/large.png",
          file_id: "file_large",
        },
        {
          maxSizeBytes: png.byteLength - 1,
          fetchImpl: async () => imageResponse(png, "image/png"),
        },
      ),
    /exceeds max size/,
  );

  await assert.rejects(
    () =>
      prepareDirectImageUpload(
        {
          download_url: "https://files.openai.example/mismatch.png",
          file_id: "file_mismatch",
          mime_type: "image/jpeg",
        },
        { fetchImpl: async () => imageResponse(png, "image/png") },
      ),
    /MIME type does not match/,
  );

  await assert.rejects(
    () =>
      prepareDirectImageUpload(
        {
          download_url: "https://files.openai.example/not-image.png",
          file_id: "file_invalid",
        },
        { fetchImpl: async () => imageResponse(new TextEncoder().encode("not an image"), "application/octet-stream") },
      ),
    /not a supported image/,
  );

  await assert.rejects(
    () =>
      prepareDirectImageUpload(
        {
          download_url: "https://files.openai.example/slow.png",
          file_id: "file_timeout",
        },
        {
          timeoutMs: 5,
          fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
          }),
        },
      ),
    /timed out/,
  );
});

test("prepareDirectImageUpload enforces the byte limit while streaming without Content-Length", async () => {
  const bytes = new Uint8Array(40);
  bytes.set(pngHeader(1, 1));
  const prepared = await prepareDirectImageUpload(
    {
      download_url: "https://files.openai.example/streamed-large.png",
      file_id: "file_streamed_large",
      mime_type: "image/png",
    },
    {
      maxSizeBytes: 32,
      fetchImpl: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 24));
          controller.enqueue(bytes.subarray(24));
          controller.close();
        },
      }), {
        headers: { "content-type": "image/png" },
      }),
    },
  );

  assert.equal(prepared.declaredSizeBytes, null);
  await assert.rejects(
    () => new Response(prepared.stream).arrayBuffer(),
    /exceeds max size/,
  );
});

function imageResponse(bytes, mimeType) {
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": mimeType,
      "content-length": String(bytes.byteLength),
    },
  });
}

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  writeUint32Be(bytes, 8, 13);
  bytes.set([73, 72, 68, 82], 12);
  writeUint32Be(bytes, 16, width);
  writeUint32Be(bytes, 20, height);
  return bytes;
}

function jpegHeader(width, height) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0,
    0x00, 0x11,
    0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
  ]);
}

function webpHeader(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70], 0);
  writeUint32Le(bytes, 4, 22);
  bytes.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
  writeUint32Le(bytes, 16, 10);
  writeUint24Le(bytes, 24, width - 1);
  writeUint24Le(bytes, 27, height - 1);
  return bytes;
}

function avifHeader(width, height) {
  const bytes = new Uint8Array(44);
  writeUint32Be(bytes, 0, 24);
  bytes.set([102, 116, 121, 112, 97, 118, 105, 102], 4);
  bytes.set([0, 0, 0, 0, 97, 118, 105, 102, 109, 105, 102, 49], 12);
  writeUint32Be(bytes, 24, 20);
  bytes.set([105, 115, 112, 101, 0, 0, 0, 0], 28);
  writeUint32Be(bytes, 36, width);
  writeUint32Be(bytes, 40, height);
  return bytes;
}

function writeUint24Le(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function writeUint32Be(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint32Le(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
