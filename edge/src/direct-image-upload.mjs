const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

export const MAX_DIRECT_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;
export const MAX_DIRECT_IMAGE_REDIRECTS = 3;
export const DIRECT_IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;

const MAX_IMAGE_HEADER_BYTES = 1024 * 1024;
const MAX_IMAGE_DIMENSION = 100_000;

export async function prepareDirectImageUpload(fileValue, options = {}) {
  const file = normalizeOpenAiFile(fileValue);
  const maxSizeBytes = normalizeMaxSize(options.maxSizeBytes ?? MAX_DIRECT_IMAGE_SIZE_BYTES);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Direct image download is not available.");
  }

  const download = await fetchWithControlledRedirects(file.downloadUrl, {
    fetchImpl,
    maxRedirects: options.maxRedirects ?? MAX_DIRECT_IMAGE_REDIRECTS,
    timeoutMs: options.timeoutMs ?? DIRECT_IMAGE_DOWNLOAD_TIMEOUT_MS,
  });

  try {
    const inspected = await inspectImageResponse(download.response, {
      expectedMimeType: file.mimeType,
      maxSizeBytes,
      onStreamDone: download.finish,
      signal: download.signal,
    });

    return {
      ...file,
      ...inspected,
    };
  } catch (error) {
    download.finish();
    try {
      await download.response.body?.cancel(error);
    } catch {
      // The body may already be locked or cancelled by the failed inspection.
    }
    throw normalizeDownloadError(error, download.signal);
  }
}

export async function prepareImageResponseUpload(response, options = {}) {
  const expectedMimeType = options.expectedMimeType == null || options.expectedMimeType === ""
    ? null
    : normalizeAllowedMimeType(options.expectedMimeType);

  return inspectImageResponse(response, {
    expectedMimeType,
    maxSizeBytes: normalizeMaxSize(options.maxSizeBytes ?? MAX_DIRECT_IMAGE_SIZE_BYTES),
    onStreamDone: options.onStreamDone,
    signal: options.signal,
  });
}

function normalizeOpenAiFile(value) {
  if (!isObjectRecord(value)) {
    throw new Error("Missing direct image file parameter.");
  }

  const downloadUrl = normalizeDownloadUrl(value.download_url).toString();
  const fileId = normalizeFileId(value.file_id);
  const mimeType = value.mime_type == null || value.mime_type === ""
    ? null
    : normalizeAllowedMimeType(value.mime_type);
  const fileName = value.file_name == null || value.file_name === ""
    ? null
    : normalizeSourceFilename(value.file_name);

  return {
    downloadUrl,
    fileId,
    mimeType,
    fileName,
  };
}

async function fetchWithControlledRedirects(initialUrl, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
  };

  let currentUrl = normalizeDownloadUrl(initialUrl);
  try {
    for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
      const response = await options.fetchImpl(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "image/jpeg, image/png, image/webp, image/avif, application/octet-stream;q=0.5",
        },
        signal: controller.signal,
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        if (!response.ok) {
          throw new Error(`Direct image download returned HTTP ${response.status}.`);
        }
        return {
          response,
          signal: controller.signal,
          finish,
        };
      }

      const location = response.headers.get("location");
      try {
        await response.body?.cancel();
      } catch {
        // Redirect bodies are intentionally discarded.
      }

      if (!location) {
        throw new Error("Direct image download redirect is missing Location.");
      }
      if (redirectCount >= options.maxRedirects) {
        throw new Error("Direct image download exceeded the redirect limit.");
      }

      currentUrl = normalizeDownloadUrl(new URL(location, currentUrl).toString());
    }
  } catch (error) {
    finish();
    throw normalizeDownloadError(error, controller.signal);
  }

  finish();
  throw new Error("Direct image download failed.");
}

async function inspectImageResponse(response, options) {
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("Direct image download returned an empty body.");
  }

  const declaredSizeBytes = normalizeContentLength(response.headers.get("content-length"));
  if (declaredSizeBytes != null && declaredSizeBytes > options.maxSizeBytes) {
    throw new Error(`Image upload exceeds max size ${options.maxSizeBytes}.`);
  }

  const responseMimeType = normalizeResponseMimeType(response.headers.get("content-type"));
  const reader = response.body.getReader();
  const prefixChunks = [];
  let prefixSize = 0;
  let imageInfo = null;

  while (!imageInfo) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error("Image header is incomplete or unsupported.");
    }

    const chunk = toUint8Array(value);
    prefixChunks.push(chunk);
    prefixSize += chunk.byteLength;
    if (prefixSize > options.maxSizeBytes) {
      throw new Error(`Image upload exceeds max size ${options.maxSizeBytes}.`);
    }

    const header = concatenatePrefix(prefixChunks, Math.min(prefixSize, MAX_IMAGE_HEADER_BYTES));
    imageInfo = detectImageInfo(header);
    if (!imageInfo && prefixSize >= MAX_IMAGE_HEADER_BYTES) {
      throw new Error("Image dimensions were not found within the supported header limit.");
    }
  }

  if (options.expectedMimeType && options.expectedMimeType !== imageInfo.mimeType) {
    throw new Error("File parameter MIME type does not match the image signature.");
  }
  if (responseMimeType && responseMimeType !== imageInfo.mimeType) {
    throw new Error("Download Content-Type does not match the image signature.");
  }

  return {
    stream: replayPrefixAndLimitStream(prefixChunks, reader, {
      initialSizeBytes: prefixSize,
      maxSizeBytes: options.maxSizeBytes,
      onDone: options.onStreamDone,
      signal: options.signal,
    }),
    detectedMimeType: imageInfo.mimeType,
    width: imageInfo.width,
    height: imageInfo.height,
    declaredSizeBytes,
  };
}

function replayPrefixAndLimitStream(prefixChunks, reader, options) {
  let prefixIndex = 0;
  let totalSizeBytes = options.initialSizeBytes;
  let completed = false;

  const finish = () => {
    if (completed) return;
    completed = true;
    options.onDone?.();
  };

  return new ReadableStream({
    async pull(controller) {
      try {
        if (prefixIndex < prefixChunks.length) {
          controller.enqueue(prefixChunks[prefixIndex]);
          prefixIndex += 1;
          return;
        }

        const { done, value } = await reader.read();
        if (done) {
          finish();
          controller.close();
          return;
        }

        const chunk = toUint8Array(value);
        totalSizeBytes += chunk.byteLength;
        if (totalSizeBytes > options.maxSizeBytes) {
          await reader.cancel("image_too_large");
          throw new Error(`Image upload exceeds max size ${options.maxSizeBytes}.`);
        }
        controller.enqueue(chunk);
      } catch (error) {
        finish();
        controller.error(normalizeDownloadError(error, options.signal));
      }
    },
    async cancel(reason) {
      finish();
      await reader.cancel(reason);
    },
  });
}

function detectImageInfo(bytes) {
  if (hasPartialPrefix(bytes, PNG_SIGNATURE)) {
    if (bytes.length < PNG_SIGNATURE.length) return null;
    return readPngInfo(bytes);
  }

  if (bytes[0] === 0xff && (bytes.length < 2 || bytes[1] === 0xd8)) {
    if (bytes.length < 2) return null;
    return readJpegInfo(bytes);
  }

  if (hasAsciiPrefix(bytes, 0, "RIFF") || hasAsciiPrefix(bytes, 8, "WEBP")) {
    if (bytes.length < 12) return null;
    return readWebpInfo(bytes);
  }

  if (bytes.length < 12) return null;
  if (readAscii(bytes, 4, 4) === "ftyp") {
    return readAvifInfo(bytes);
  }

  throw new Error("File content is not a supported image.");
}

function readPngInfo(bytes) {
  if (bytes.length < 24) return null;
  if (readUint32Be(bytes, 8) !== 13 || readAscii(bytes, 12, 4) !== "IHDR") {
    throw new Error("Invalid PNG image header.");
  }
  return imageInfo("image/png", readUint32Be(bytes, 16), readUint32Be(bytes, 20));
}

function readJpegInfo(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error("Invalid JPEG marker sequence.");
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) {
      throw new Error("JPEG dimensions were not found before image data.");
    }
    if (offset + 2 > bytes.length) return null;

    const segmentLength = readUint16Be(bytes, offset);
    if (segmentLength < 2) throw new Error("Invalid JPEG segment length.");
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (offset + 7 > bytes.length) return null;
      return imageInfo("image/jpeg", readUint16Be(bytes, offset + 5), readUint16Be(bytes, offset + 3));
    }
    if (offset + segmentLength > bytes.length) return null;
    offset += segmentLength;
  }
  return null;
}

function readWebpInfo(bytes) {
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") {
    throw new Error("Invalid WebP image header.");
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkSize = readUint32Le(bytes, offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === "VP8X") {
      if (dataOffset + 10 > bytes.length) return null;
      return imageInfo(
        "image/webp",
        1 + readUint24Le(bytes, dataOffset + 4),
        1 + readUint24Le(bytes, dataOffset + 7),
      );
    }

    if (chunkType === "VP8L") {
      if (dataOffset + 5 > bytes.length) return null;
      if (bytes[dataOffset] !== 0x2f) throw new Error("Invalid lossless WebP image header.");
      const b0 = bytes[dataOffset + 1];
      const b1 = bytes[dataOffset + 2];
      const b2 = bytes[dataOffset + 3];
      const b3 = bytes[dataOffset + 4];
      return imageInfo(
        "image/webp",
        1 + b0 + ((b1 & 0x3f) << 8),
        1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
      );
    }

    if (chunkType === "VP8 ") {
      if (dataOffset + 10 > bytes.length) return null;
      if (bytes[dataOffset + 3] !== 0x9d || bytes[dataOffset + 4] !== 0x01 || bytes[dataOffset + 5] !== 0x2a) {
        throw new Error("Invalid lossy WebP image header.");
      }
      return imageInfo(
        "image/webp",
        readUint16Le(bytes, dataOffset + 6) & 0x3fff,
        readUint16Le(bytes, dataOffset + 8) & 0x3fff,
      );
    }

    const nextOffset = dataOffset + chunkSize + (chunkSize % 2);
    if (nextOffset > bytes.length) return null;
    offset = nextOffset;
  }
  return null;
}

function readAvifInfo(bytes) {
  const ftypSize = readUint32Be(bytes, 0);
  if (ftypSize < 16) throw new Error("Invalid AVIF file type box.");
  if (bytes.length < ftypSize) return null;

  const brands = [];
  brands.push(readAscii(bytes, 8, 4));
  for (let offset = 16; offset + 4 <= ftypSize; offset += 4) {
    brands.push(readAscii(bytes, offset, 4));
  }
  if (!brands.includes("avif") && !brands.includes("avis")) {
    throw new Error("File type box is not AVIF.");
  }

  for (let typeOffset = ftypSize + 4; typeOffset + 16 <= bytes.length; typeOffset += 1) {
    if (readAscii(bytes, typeOffset, 4) !== "ispe") continue;
    const boxSize = readUint32Be(bytes, typeOffset - 4);
    if (boxSize < 20 || bytes[typeOffset + 4] !== 0) continue;
    return imageInfo(
      "image/avif",
      readUint32Be(bytes, typeOffset + 8),
      readUint32Be(bytes, typeOffset + 12),
    );
  }
  return null;
}

function imageInfo(mimeType, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Image dimensions are invalid.");
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`Image dimensions exceed ${MAX_IMAGE_DIMENSION} pixels.`);
  }
  return { mimeType, width, height };
}

function normalizeDownloadUrl(value) {
  let url;
  try {
    url = new URL(requiredString(value, "download_url"));
  } catch {
    throw new Error("Invalid direct image download URL.");
  }

  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Direct image download URL must use HTTPS without credentials or a custom port.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isForbiddenHostname(hostname)) {
    throw new Error("Direct image download host is not allowed.");
  }
  url.hash = "";
  return url;
}

function isForbiddenHostname(hostname) {
  if (!hostname || !hostname.includes(".")) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  if (hostname.includes(":")) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function normalizeFileId(value) {
  const fileId = requiredString(value, "file_id");
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(fileId)) {
    throw new Error("Invalid direct image file_id.");
  }
  return fileId;
}

function normalizeSourceFilename(value) {
  const fileName = requiredString(value, "file_name");
  if ([...fileName].length > 512 || /[\u0000-\u001f\u007f]/.test(fileName)) {
    throw new Error("Invalid direct image file_name.");
  }
  return fileName;
}

function normalizeAllowedMimeType(value) {
  const mimeType = requiredString(value, "mime_type").toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Unsupported image format.");
  }
  return mimeType;
}

function normalizeResponseMimeType(value) {
  const mimeType = String(value ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType || mimeType === "application/octet-stream") return null;
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Direct image download returned an unsupported Content-Type.");
  }
  return mimeType;
}

function normalizeContentLength(value) {
  if (value == null || value === "") return null;
  if (!/^\d+$/.test(value)) throw new Error("Direct image download returned an invalid Content-Length.");
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error("Direct image download returned an invalid Content-Length.");
  }
  return size;
}

function normalizeMaxSize(value) {
  const maxSize = Number(value);
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) throw new Error("Invalid direct upload size limit.");
  return maxSize;
}

function normalizeDownloadError(error, signal) {
  if (signal?.aborted) return new Error("Direct image download timed out.");
  return error instanceof Error ? error : new Error("Direct image download failed.");
}

function concatenatePrefix(chunks, length) {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= length) break;
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, length - offset));
    output.set(slice, offset);
    offset += slice.byteLength;
  }
  return output;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("Direct image download returned an invalid stream chunk.");
}

function hasPartialPrefix(bytes, prefix) {
  const length = Math.min(bytes.length, prefix.length);
  for (let index = 0; index < length; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return length > 0;
}

function hasAsciiPrefix(bytes, offset, expected) {
  if (bytes.length <= offset) return false;
  const available = Math.min(bytes.length - offset, expected.length);
  for (let index = 0; index < available; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return available > 0;
}

function readAscii(bytes, offset, length) {
  if (offset + length > bytes.length) return "";
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index]);
  return value;
}

function readUint16Be(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16Le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24Le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32Be(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
}

function readUint32Le(bytes, offset) {
  return (
    bytes[offset]
    + (bytes[offset + 1] << 8)
    + (bytes[offset + 2] << 16)
    + (bytes[offset + 3] * 0x1000000)
  ) >>> 0;
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${name}.`);
  return value.trim();
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
