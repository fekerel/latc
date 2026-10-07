import { Router } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../common/errors/app-error.js";

const DEFAULT_STREAMING_SERVICE_BASE_URL = "http://127.0.0.1:11470";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export function createStreamingServiceProxyRouter(options = {}) {
  const router = Router();
  const fetchFn = options.fetch ?? fetch;
  const upstreamBaseUrl =
    options.upstreamBaseUrl ?? DEFAULT_STREAMING_SERVICE_BASE_URL;

  router.use(async (request, response) => {
    const abortController = new AbortController();
    const abortUpstream = () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    };
    const upstreamUrl = resolveUpstreamUrl(upstreamBaseUrl, request.originalUrl);

    request.once("aborted", abortUpstream);
    response.once("close", abortUpstream);

    try {
      const upstream = await fetchUpstream(fetchFn, request, upstreamUrl, {
        signal: abortController.signal
      });

      copyUpstreamResponse(upstream, response);

      if (request.method === "HEAD" || !upstream.body) {
        response.end();
        return;
      }

      await pipeUpstreamBody(upstream, response);
    } catch (error) {
      if (!abortController.signal.aborted && !isExpectedStreamingError(error)) {
        throw error;
      }
    } finally {
      request.off("aborted", abortUpstream);
      response.off("close", abortUpstream);
    }
  });

  return router;
}

async function fetchUpstream(fetchFn, request, upstreamUrl, options = {}) {
  try {
    return await fetchFn(upstreamUrl, {
      method: request.method,
      headers: createForwardedHeaders(request, upstreamUrl),
      body: createForwardedBody(request),
      duplex: hasRequestBody(request) ? "half" : undefined,
      redirect: "manual",
      signal: options.signal
    });
  } catch (error) {
    if (options.signal?.aborted || isExpectedStreamingError(error)) {
      throw error;
    }

    throw new AppError(
      `Streaming service proxy failed to reach upstream: ${upstreamUrl}`,
      502,
      {
        cause: error.cause?.message ?? error.message
      }
    );
  }
}

async function pipeUpstreamBody(upstream, response) {
  const upstreamBody = Readable.fromWeb(upstream.body);

  upstreamBody.on("error", ignoreStreamError);

  try {
    await pipeline(upstreamBody, response);
  } catch (error) {
    if (isExpectedStreamingError(error) || response.headersSent) {
      if (!response.destroyed && !response.writableEnded) {
        response.destroy();
      }

      return;
    }

    if (!response.headersSent) {
      throw error;
    }
  }
}

function resolveUpstreamUrl(upstreamBaseUrl, requestUrl) {
  const baseUrl = new URL(upstreamBaseUrl);

  return new URL(requestUrl, ensureTrailingSlash(baseUrl.href)).href;
}

function createForwardedHeaders(request, upstreamUrl) {
  const headers = {};

  for (const [name, value] of Object.entries(request.headers)) {
    if (!value || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    headers[name] = value;
  }

  headers.host = new URL(upstreamUrl).host;

  return headers;
}

function createForwardedBody(request) {
  return hasRequestBody(request) ? request : undefined;
}

function hasRequestBody(request) {
  return !["GET", "HEAD"].includes(request.method);
}

function copyUpstreamResponse(upstream, response) {
  response.status(upstream.status);

  upstream.headers.forEach((value, name) => {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      response.setHeader(name, value);
    }
  });
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function ignoreStreamError() {}

function isExpectedStreamingError(error) {
  return (
    error.name === "AbortError" ||
    error.message === "terminated" ||
    error.cause?.code === "UND_ERR_SOCKET" ||
    error.code === "ERR_STREAM_PREMATURE_CLOSE"
  );
}
