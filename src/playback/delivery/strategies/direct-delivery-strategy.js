import { Readable } from "node:stream";
import { normalizeContentType } from "../../../common/content-type.js";
import { createDefaultDlnaFeatures } from "../../../common/dlna.js";

export class DirectDeliveryStrategy {
  static kind = "direct";
  static label = "Direct URL";
  static defaultConfig = {};

  constructor(config = {}, deps = {}) {
    this.config = config;
    this.fetch = deps.fetch ?? fetch;
  }

  async prepare(source) {
    const { url, response } = await resolveUpstream({
      fetch: this.fetch,
      url: source.url
    });
    const upstreamContentType = response.headers.get("content-type") ?? undefined;
    const contentType = resolveDeclaredContentType(
      upstreamContentType,
      this.config.declaredContentTypeOverrides
    );

    return {
      upstreamUrl: url,
      upstreamContentType,
      contentType,
      contentLength: response.headers.get("content-length") ?? undefined,
      acceptRanges: "bytes"
    };
  }

  async handleRequest({ session, request, response }) {
    if (request.method === "HEAD") {
      await handleHeadRequest({
        session,
        request,
        response,
        fetch: this.fetch
      });
      return;
    }

    const upstream = await this.fetch(getUpstreamUrl(session), {
      headers: pickForwardedHeaders(request)
    });

    copyUpstreamResponseHeaders(upstream, response, session);

    if (!upstream.body) {
      response.end();
      return;
    }

    Readable.fromWeb(upstream.body).pipe(response);
  }
}

async function handleHeadRequest({ session, request, response, fetch }) {
  const upstream = await fetch(getUpstreamUrl(session), {
    method: "GET",
    headers: pickForwardedHeaders(request)
  });

  copyUpstreamResponseHeaders(upstream, response, session);
  response.end();
}

async function resolveUpstream({ fetch, url, maxRedirects = 10 }) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual"
    });

    if (!isRedirect(response.status)) {
      return {
        url: currentUrl,
        response
      };
    }

    const location = response.headers.get("location");

    if (!location) {
      return {
        url: currentUrl,
        response
      };
    }

    currentUrl = new URL(location, currentUrl).href;
  }

  throw new Error("too_many_redirects");
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function getUpstreamUrl(session) {
  return session.mediaResource.upstreamUrl ?? session.source.url;
}

function pickForwardedHeaders(request) {
  const headers = {};

  if (request.headers.range) {
    headers.range = request.headers.range;
  }

  return headers;
}

function copyHeader(upstream, response, name) {
  const value = upstream.headers.get(name);

  if (value) {
    response.setHeader(name, value);
  }
}

function copyUpstreamResponseHeaders(upstream, response, session) {
  response.status(upstream.status);
  setHeader(response, "content-type", session.mediaResource.contentType);
  setHeader(response, "content-length", getContentLength(upstream, session));
  copyHeader(upstream, response, "content-range");
  setHeader(response, "accept-ranges", "bytes");
  setHeader(
    response,
    "contentFeatures.dlna.org",
    createDefaultDlnaFeatures(session.mediaResource.contentType)
  );
  setHeader(response, "transferMode.dlna.org", "Interactive");
  setHeader(response, "connection", "close");
}

function setHeader(response, name, value) {
  if (value) {
    response.setHeader(name, value);
  }
}

function getContentLength(upstream, session) {
  const upstreamContentLength = upstream.headers.get("content-length");

  if (upstream.status === 206 || upstream.headers.get("content-range")) {
    return upstreamContentLength ?? undefined;
  }

  return session.mediaResource.contentLength ?? upstreamContentLength ?? undefined;
}

function resolveDeclaredContentType(upstreamContentType, overrides = {}) {
  const normalizedContentType = normalizeContentType(upstreamContentType);

  return (
    overrides[normalizedContentType] ??
    overrides[upstreamContentType] ??
    normalizedContentType ??
    upstreamContentType
  );
}
