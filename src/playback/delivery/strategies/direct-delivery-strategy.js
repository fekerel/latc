import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
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
      resolvedUrl: url,
      upstreamContentType,
      contentType,
      contentLength: response.headers.get("content-length") ?? undefined,
      acceptRanges: "bytes"
    };
  }

  async handleRequest({ session, request, response }) {
    if (request.method === "HEAD") {
      handleHeadRequest({
        session,
        response
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

    const source = Readable.fromWeb(upstream.body);
    const cleanupStreamListeners = registerStreamListeners({
      session,
      request,
      response,
      source
    });
    
    try {
      await pipeline(source, response);
      logStreamEvent(session, "pipeline_complete", {
        sourceDestroyed: source.destroyed,
        responseDestroyed: response.destroyed,
        responseWritableEnded: response.writableEnded
      });
    } catch (error) {
      logStreamError(session, "pipeline_error", error, {
        sourceDestroyed: source.destroyed,
        responseDestroyed: response.destroyed,
        responseWritableEnded: response.writableEnded
      });

      if (!response.headersSent) {
        throw error;
      }
    } finally {
      cleanupStreamListeners();
    }
  }
}

function handleHeadRequest({ session, response }) {
  writePreparedMediaHeaders(response, session);
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
  return session.source.url;
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

function writePreparedMediaHeaders(response, session) {
  response.status(200);
  setHeader(response, "content-type", session.mediaResource.contentType);
  setHeader(response, "content-length", session.mediaResource.contentLength);
  setHeader(response, "accept-ranges", session.mediaResource.acceptRanges);
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

function registerStreamListeners({ session, request, response, source }) {
  const context = {
    method: request.method,
    range: request.headers.range
  };
  const onSourceEnd = () => {
    logStreamEvent(session, "upstream_end", context);
  };
  const onSourceClose = () => {
    logStreamEvent(session, "upstream_close", {
      ...context,
      sourceDestroyed: source.destroyed
    });
  };
  const onSourceError = (error) => {
    logStreamError(session, "upstream_error", error, context);
  };
  const onResponseFinish = () => {
    logStreamEvent(session, "response_finish", context);
  };
  const onResponseClose = () => {
    logStreamEvent(session, "response_close", {
      ...context,
      responseDestroyed: response.destroyed,
      responseWritableEnded: response.writableEnded
    });
  };
  const onResponseError = (error) => {
    logStreamError(session, "response_error", error, context);
  };

  source.on("end", onSourceEnd);
  source.on("close", onSourceClose);
  source.on("error", onSourceError);
  response.on?.("finish", onResponseFinish);
  response.on?.("close", onResponseClose);
  response.on?.("error", onResponseError);

  return () => {
    source.off("end", onSourceEnd);
    source.off("close", onSourceClose);
    source.off("error", onSourceError);
    response.off?.("finish", onResponseFinish);
    response.off?.("close", onResponseClose);
    response.off?.("error", onResponseError);
  };
}

function logStreamEvent(session, event, details = {}) {
  console.info("[direct-delivery] stream_event", {
    sessionId: session.id,
    event,
    ...details
  });
}

function logStreamError(session, event, error, details = {}) {
  console.error("[direct-delivery] stream_error", {
    sessionId: session.id,
    event,
    name: error.name,
    code: error.code,
    message: error.message,
    ...details
  });
}
