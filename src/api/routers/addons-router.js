import { Router } from "express";
import { Readable } from "node:stream";
import { BadRequestError } from "../../common/errors/bad-request-error.js";

export function createAddonsRouter() {
  const router = Router();
  
  router.post("/new", async (req, res) => {
    const manifestUrl = req.body?.manifestUrl ?? req.query.manifestUrl;
    const addonBaseUrl = normalizeAddonBaseUrl(manifestUrl);

    res.json({
      proxyUrl: `/addons/proxy/${encodeURIComponent(addonBaseUrl)}/manifest.json`
    });
  });

  router.all(/^\/proxy(?:\/.*)?$/, async (req, res) => {
    if (req.method === "OPTIONS") {
      setCorsHeaders(res);
      res.status(204).end();
      return;
    }

    const targetUrl = resolveProxyTargetUrl(req.url);
    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers: createProxyRequestHeaders(req),
      body: createProxyRequestBody(req),
      duplex: "half"
    });

    setCorsHeaders(res);
    res.status(upstreamResponse.status);

    for (const [name, value] of upstreamResponse.headers) {
      if (!isProxyResponseHeader(name)) {
        res.setHeader(name, value);
      }
    }

    if (!upstreamResponse.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body).pipe(res);
  });
  
  return router;
}

export function normalizeAddonBaseUrl(manifestUrl) {
  if (!manifestUrl) {
    throw new BadRequestError("manifestUrl is required");
  }

  const url = parseHttpUrl(manifestUrl, "manifestUrl must be an absolute http(s) URL");
  url.hash = "";

  if (url.pathname.endsWith("/manifest.json")) {
    url.pathname = url.pathname.slice(0, -"/manifest.json".length) || "/";
  }

  url.search = "";
  return url.href.replace(/\/$/, "");
}

export function resolveProxyTargetUrl(requestUrl) {
  const url = new URL(requestUrl, "http://latc.local");
  const proxyPrefix = "/proxy/";

  if (!url.pathname.startsWith(proxyPrefix)) {
    throw new BadRequestError("Invalid addon proxy path");
  }

  const proxyPath = url.pathname.slice(proxyPrefix.length);
  const pathSeparatorIndex = proxyPath.indexOf("/");
  const encodedAddonBaseUrl =
    pathSeparatorIndex === -1 ? proxyPath : proxyPath.slice(0, pathSeparatorIndex);
  const stremioPath =
    pathSeparatorIndex === -1 ? "/manifest.json" : proxyPath.slice(pathSeparatorIndex);

  if (!encodedAddonBaseUrl) {
    throw new BadRequestError("Addon base URL is required");
  }

  let addonBaseUrl;
  try {
    addonBaseUrl = decodeURIComponent(encodedAddonBaseUrl);
  } catch {
    throw new BadRequestError("Addon base URL is not valid URL-encoded text");
  }

  const baseUrl = parseHttpUrl(addonBaseUrl, "Addon base URL must be an absolute http(s) URL");
  baseUrl.hash = "";

  const targetUrl = new URL(stremioPath.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl.href));
  targetUrl.search = url.search;
  return targetUrl;
}

function parseHttpUrl(value, message) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new BadRequestError(message);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestError(message);
  }

  return url;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

function createProxyRequestHeaders(req) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (isProxyRequestHeader(name) && value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  headers.set("accept-encoding", "identity");
  return headers;
}

function createProxyRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  if (req.body !== undefined) {
    return JSON.stringify(req.body);
  }

  return req.readableEnded ? undefined : req;
}

function isProxyRequestHeader(name) {
  return ![
    "host",
    "connection",
    "content-length",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
  ].includes(name.toLowerCase());
}

function isProxyResponseHeader(name) {
  return [
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
  ].includes(name.toLowerCase());
}
