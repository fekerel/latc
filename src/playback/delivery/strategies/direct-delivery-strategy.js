import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { normalizeContentType } from "../../../common/content-type.js";
import { createHttpDlnaFeatures } from "../../../common/dlna.js";
import { NotFoundError } from "../../../common/errors/not-found-error.js";

export class DirectDeliveryStrategy {
  static kind = "direct";
  static label = "Direct URL";
  static defaultConfig = {};

  constructor(config = {}, deps = {}) {
    this.config = config;
    this.fetch = deps.fetch ?? fetch;
  }

  async prepare(source) {
    return {
      video: await this.prepareVideo(source),
      subtitle: source.subtitle
        ? await this.prepareSubtitle(source.subtitle)
        : undefined
    };
  }

  async prepareVideo(source) {
    const { url, response } = await resolveUpstream({
      fetch: this.fetch,
      url: source.url
    });

    return createVideoResource({
      resolvedUrl: url,
      response,
      declaredContentTypeOverrides: this.config.declaredContentTypeOverrides
    });
  }

  async prepareSubtitle(subtitle) {
    const { url, response } = await resolveUpstream({
      fetch: this.fetch,
      url: subtitle.url
    });

    await response.body?.cancel?.();

    return {
      resolvedUrl: url,
      contentType: "application/x-subrip",
      contentLength: response.headers.get("content-length") ?? undefined,
      language: subtitle.language
    };
  }

  async handleRequest({ session, resourceKind = "video", request, response }) {
    if (request.method === "HEAD") {
      handleHeadRequest({
        session,
        resourceKind,
        response
      });
      return;
    }

    const resource = getSessionResource(session, resourceKind);
    const upstream = await this.fetch(getSourceUrl(session, resourceKind), {
      headers: pickForwardedHeaders(request)
    });

    copyUpstreamResponseHeaders(upstream, response, resource);

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

function handleHeadRequest({ session, resourceKind, response }) {
  writePreparedMediaHeaders(response, getSessionResource(session, resourceKind));
  response.end();
}

function createVideoResource({
  resolvedUrl,
  response,
  declaredContentTypeOverrides
}) {
  const upstreamContentType = response.headers.get("content-type") ?? undefined;
  const contentType = resolveDeclaredContentType(
    upstreamContentType,
    declaredContentTypeOverrides
  );
  const contentLength = response.headers.get("content-length") ?? undefined;
  const acceptRanges = response.headers.has("accept-ranges")
    ? "bytes"
    : undefined;
  const seekable = Boolean(contentLength && acceptRanges);

  return {
    resolvedUrl,
    upstreamContentType,
    contentType,
    contentLength,
    acceptRanges,
    seekable,
    dlnaFeatures: createHttpDlnaFeatures({
      contentType,
      seekable
    })
  };
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

function getSessionResource(session, resourceKind) {
  const resource = session.mediaResource[resourceKind];

  if (!resource) {
    throw new NotFoundError("Media resource not found");
  }

  return resource;
}

function getSourceUrl(session, resourceKind) {
  if (resourceKind === "subtitle") {
    return session.source.subtitle?.url;
  }

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

function copyUpstreamResponseHeaders(upstream, response, resource) {
  response.status(upstream.status);
  setHeader(response, "content-type", resource.contentType);
  setHeader(response, "content-length", getContentLength(upstream, resource));
  copyHeader(upstream, response, "content-range");
  setHeader(response, "accept-ranges", resource.acceptRanges);
  setHeader(
    response,
    "contentFeatures.dlna.org",
    resource.dlnaFeatures
  );
  setHeader(response, "transferMode.dlna.org", getTransferMode(resource));
  setHeader(response, "connection", "close");
}

function writePreparedMediaHeaders(response, resource) {
  response.status(200);
  setHeader(response, "content-type", resource.contentType);
  setHeader(response, "content-length", resource.contentLength);
  setHeader(response, "accept-ranges", resource.acceptRanges);
  setHeader(
    response,
    "contentFeatures.dlna.org",
    resource.dlnaFeatures
  );
  setHeader(response, "transferMode.dlna.org", getTransferMode(resource));
  setHeader(response, "connection", "close");
}

function setHeader(response, name, value) {
  if (value) {
    response.setHeader(name, value);
  }
}

function getContentLength(upstream, resource) {
  const upstreamContentLength = upstream.headers.get("content-length");

  if (upstream.status === 206 || upstream.headers.get("content-range")) {
    return upstreamContentLength ?? undefined;
  }

  return resource.contentLength ?? upstreamContentLength ?? undefined;
}

function getTransferMode(resource) {
  if (!resource.dlnaFeatures) {
    return undefined;
  }

  return resource.seekable ? "Interactive" : "Streaming";
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
