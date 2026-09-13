import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.mjs";

const KEY = "media/v1/video/demo.mp4";
const BYTES = new TextEncoder().encode("0123456789");
const UPLOADED = new Date("2026-09-13T00:00:00Z");

function metadata() {
  return {
    size: BYTES.byteLength,
    httpEtag: '"demo-etag"',
    uploaded: UPLOADED,
  };
}

function environment() {
  return {
    MEDIA: {
      async head(key) {
        return key === KEY ? metadata() : null;
      },
      async get(key, options = {}) {
        if (key !== KEY) return null;
        const range = options.range;
        const body = range
          ? BYTES.slice(range.offset, range.offset + range.length)
          : BYTES;
        return {
          ...metadata(),
          body,
          ...(range ? { range } : {}),
        };
      },
    },
  };
}

function request(path = KEY, init) {
  return new Request(`https://portfolio-media.example/${path}`, init);
}

test("streams a complete object with locked media headers", async () => {
  const response = await worker.fetch(request(), environment());

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0123456789");
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-length"), "10");
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=31536000, immutable"
  );
});

test("HEAD returns metadata without a body", async () => {
  const response = await worker.fetch(
    request(KEY, { method: "HEAD" }),
    environment()
  );

  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("content-length"), "10");
  assert.equal(response.headers.get("etag"), '"demo-etag"');
});

for (const [header, expectedBody, expectedRange] of [
  ["bytes=2-5", "2345", "bytes 2-5/10"],
  ["bytes=7-", "789", "bytes 7-9/10"],
  ["bytes=-3", "789", "bytes 7-9/10"],
  ["bytes=8-99", "89", "bytes 8-9/10"],
]) {
  test(`serves ${header} as a single byte range`, async () => {
    const response = await worker.fetch(
      request(KEY, { headers: { Range: header } }),
      environment()
    );

    assert.equal(response.status, 206);
    assert.equal(await response.text(), expectedBody);
    assert.equal(response.headers.get("content-range"), expectedRange);
    assert.equal(response.headers.get("content-length"), String(expectedBody.length));
  });
}

for (const header of [
  "items=0-1",
  "bytes=",
  "bytes=3-2",
  "bytes=99-",
  "bytes=-0",
  "bytes=0-1,4-5",
]) {
  test(`rejects unsupported range ${header}`, async () => {
    const response = await worker.fetch(
      request(KEY, { headers: { Range: header } }),
      environment()
    );

    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    assert.equal(response.headers.get("content-length"), "0");
  });
}

test("returns 304 for a matching If-None-Match", async () => {
  const response = await worker.fetch(
    request(KEY, { headers: { "If-None-Match": 'W/"demo-etag"' } }),
    environment()
  );

  assert.equal(response.status, 304);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("content-length"), null);
});

test("returns 412 when If-Match does not match", async () => {
  const response = await worker.fetch(
    request(KEY, { headers: { "If-Match": '"old-etag"' } }),
    environment()
  );

  assert.equal(response.status, 412);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("gives If-None-Match precedence over If-Modified-Since", async () => {
  const response = await worker.fetch(
    request(KEY, {
      headers: {
        "If-None-Match": '"different-etag"',
        "If-Modified-Since": "Sun, 13 Sep 2026 00:00:00 GMT",
      },
    }),
    environment()
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0123456789");
});

test("ignores Range when If-Range does not match", async () => {
  const response = await worker.fetch(
    request(KEY, {
      headers: { Range: "bytes=0-2", "If-Range": '"old-etag"' },
    }),
    environment()
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0123456789");
  assert.equal(response.headers.get("content-range"), null);
});

test("does not expose missing objects or bucket listings", async () => {
  const missing = await worker.fetch(
    request("media/v1/video/missing.mp4"),
    environment()
  );
  const root = await worker.fetch(request(""), environment());

  assert.equal(missing.status, 404);
  assert.equal(root.status, 404);
});

test("rejects writes and cache-key query variants", async () => {
  const put = await worker.fetch(
    request(KEY, { method: "PUT", body: "overwrite" }),
    environment()
  );
  const query = await worker.fetch(
    request(`${KEY}?download=1`),
    environment()
  );

  assert.equal(put.status, 405);
  assert.equal(put.headers.get("allow"), "GET, HEAD, OPTIONS");
  assert.equal(query.status, 404);
});

test("rejects alternate percent-encoded path spellings", async () => {
  const response = await worker.fetch(
    request("%6dedia/v1/video/demo.mp4"),
    environment()
  );

  assert.equal(response.status, 404);
});

test("answers CORS preflight only for a valid media key", async () => {
  const response = await worker.fetch(
    request(KEY, { method: "OPTIONS" }),
    environment()
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(
    response.headers.get("access-control-allow-methods"),
    "GET, HEAD, OPTIONS"
  );
});
