const MEDIA_KEY =
  /^media\/v[1-9]\d*\/(?:intro\.jpg|(?:grid|full|hero|about)\/[a-z0-9][a-z0-9_-]*\.jpg|video\/(?:[a-z0-9][a-z0-9_-]*\.mp4|poster\/[a-z0-9][a-z0-9_-]*\.jpg))$/;
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const EXPOSED_HEADERS =
  "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified";

function mediaKey(rawUrl) {
  const url = new URL(rawUrl);
  if (url.search) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    /[\0-\x1f\x7f]/.test(pathname)
  ) {
    return null;
  }

  const key = pathname.slice(1);
  if (url.pathname !== `/${key}`) return null;
  return MEDIA_KEY.test(key) ? key : null;
}

function baseHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
}

function objectHeaders(object, key, length = object.size) {
  const headers = baseHeaders();
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", IMMUTABLE_CACHE);
  headers.set("Content-Disposition", "inline");
  headers.set("Content-Type", key.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
  headers.set("Content-Length", String(length));
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  return headers;
}

function textResponse(method, status, message, extraHeaders = {}) {
  const headers = baseHeaders();
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "text/plain; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }
  return new Response(method === "HEAD" ? null : message, { status, headers });
}

function etagMatches(list, current, weakComparison) {
  const normalizedCurrent = current.replace(/^W\//, "");
  return list.split(",").some(raw => {
    const candidate = raw.trim();
    if (candidate === "*") return true;
    if (weakComparison) {
      return candidate.replace(/^W\//, "") === normalizedCurrent;
    }
    return !candidate.startsWith("W/") && candidate === current;
  });
}

function secondPrecision(date) {
  return Math.floor(date.getTime() / 1000) * 1000;
}

function conditionalStatus(request, object) {
  const ifMatch = request.headers.get("If-Match");
  if (ifMatch && !etagMatches(ifMatch, object.httpEtag, false)) return 412;

  if (!ifMatch) {
    const raw = request.headers.get("If-Unmodified-Since");
    const when = raw ? Date.parse(raw) : Number.NaN;
    if (Number.isFinite(when) && secondPrecision(object.uploaded) > when) {
      return 412;
    }
  }

  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && etagMatches(ifNoneMatch, object.httpEtag, true)) return 304;

  if (!ifNoneMatch) {
    const raw = request.headers.get("If-Modified-Since");
    const when = raw ? Date.parse(raw) : Number.NaN;
    if (Number.isFinite(when) && secondPrecision(object.uploaded) <= when) {
      return 304;
    }
  }

  return null;
}

function conditionalResponse(status, object, key) {
  const headers = objectHeaders(object, key);
  headers.delete("Content-Length");
  if (status === 412) headers.set("Cache-Control", "no-store");
  return new Response(null, { status, headers });
}

function parseRange(rawRange, size) {
  if (size === 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rawRange.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start >= size) return null;

  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(end) || end < start) return null;
  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1 };
}

function ifRangeMatches(rawIfRange, object) {
  const value = rawIfRange.trim();
  if (value.startsWith("W/")) return false;
  if (value.startsWith('"')) return value === object.httpEtag;

  const when = Date.parse(value);
  return Number.isFinite(when) && secondPrecision(object.uploaded) <= when;
}

async function fullResponse(env, key) {
  const object = await env.MEDIA.get(key);
  if (!object || !("body" in object)) return null;
  return new Response(object.body, {
    status: 200,
    headers: objectHeaders(object, key),
  });
}

export default {
  async fetch(request, env) {
    const key = mediaKey(request.url);
    if (!key) return textResponse(request.method, 404, "Not Found");

    if (request.method === "OPTIONS") {
      const headers = baseHeaders();
      headers.set("Allow", "GET, HEAD, OPTIONS");
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Range, If-Range, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since"
      );
      headers.set("Access-Control-Max-Age", "86400");
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse(request.method, 405, "Method Not Allowed", {
        Allow: "GET, HEAD, OPTIONS",
      });
    }

    try {
      if (request.method === "HEAD") {
        const object = await env.MEDIA.head(key);
        if (!object) return textResponse("HEAD", 404, "Not Found");

        const condition = conditionalStatus(request, object);
        if (condition) return conditionalResponse(condition, object, key);

        return new Response(null, {
          status: 200,
          headers: objectHeaders(object, key),
        });
      }

      const rawRange = request.headers.get("Range");
      if (!rawRange) {
        const object = await env.MEDIA.get(key, { onlyIf: request.headers });
        if (!object) return textResponse("GET", 404, "Not Found");

        const condition = conditionalStatus(request, object);
        if (condition) return conditionalResponse(condition, object, key);
        if (!("body" in object)) return conditionalResponse(412, object, key);

        return new Response(object.body, {
          status: 200,
          headers: objectHeaders(object, key),
        });
      }

      const metadata = await env.MEDIA.head(key);
      if (!metadata) return textResponse("GET", 404, "Not Found");

      const condition = conditionalStatus(request, metadata);
      if (condition) return conditionalResponse(condition, metadata, key);

      const rawIfRange = request.headers.get("If-Range");
      if (rawIfRange && !ifRangeMatches(rawIfRange, metadata)) {
        const response = await fullResponse(env, key);
        return response || textResponse("GET", 404, "Not Found");
      }

      const wanted = parseRange(rawRange, metadata.size);
      if (!wanted) {
        const headers = objectHeaders(metadata, key, 0);
        headers.set("Cache-Control", "no-store");
        headers.set("Content-Range", `bytes */${metadata.size}`);
        return new Response(null, { status: 416, headers });
      }

      const object = await env.MEDIA.get(key, { range: wanted });
      if (!object || !("body" in object)) {
        return textResponse("GET", 404, "Not Found");
      }

      const offset = object.range?.offset ?? wanted.offset;
      const length = object.range?.length ?? wanted.length;
      const headers = objectHeaders(object, key, length);
      headers.set(
        "Content-Range",
        `bytes ${offset}-${offset + length - 1}/${metadata.size}`
      );
      return new Response(object.body, { status: 206, headers });
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "r2_media_read_failed",
          method: request.method,
          key,
          ray: request.headers.get("cf-ray"),
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return textResponse(request.method, 500, "Internal Server Error");
    }
  },
};
