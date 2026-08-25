import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestError } from "../common/errors/bad-request-error.js";

const PROXY_REQUEST_BASE_URL = "http://latc.local";
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "range",
  "user-agent"
];
const COPIED_RESPONSE_HEADERS = [
  "cache-control",
  "content-length",
  "content-type",
  "etag",
  "last-modified"
];

export class AddonProxyService {
  constructor(options = {}) {
    this.fetch = options.fetch ?? fetch;
    this.getPublicBaseUrl = options.getPublicBaseUrl;
  }

  createManifestProxyUrl(manifestUrl) {
    const normalizedManifestUrl = normalizeManifestUrl(manifestUrl);
    const encodedManifestUrl = encodeManifestUrl(normalizedManifestUrl);

    return `/api/addon-proxies/${encodedManifestUrl}/manifest.json`;
  }

  async handleRequest({ encodedManifestUrl, request, response }) {
    const manifestUrl = decodeManifestUrl(encodedManifestUrl);
    const upstreamUrl = resolveUpstreamUrl({
      manifestUrl,
      proxyRequestUrl: request.url
    });
    const upstream = await this.fetch(upstreamUrl, {
      method: request.method,
      headers: pickForwardedHeaders(request)
    });

    copyUpstreamResponseHeaders(upstream, response);

    if (request.method === "HEAD" || !upstream.body) {
      response.end();
      return;
    }

    try {
      await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      if (!response.headersSent) {
        throw error;
      }
    }
  }

  getRequiredPublicBaseUrl() {
    if (!this.getPublicBaseUrl) {
      throw new BadRequestError("getPublicBaseUrl is required");
    }

    return trimTrailingSlash(this.getPublicBaseUrl());
  }
}

function normalizeManifestUrl(manifestUrl) {
  if (!manifestUrl) {
    throw new BadRequestError("manifestUrl is required");
  }

  let url;

  try {
    url = new URL(manifestUrl);
  } catch {
    throw new BadRequestError("manifestUrl must be a valid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new BadRequestError("manifestUrl must use http or https");
  }

  return url.href;
}

function encodeManifestUrl(manifestUrl) {
  return Buffer.from(manifestUrl, "utf8").toString("base64url");
}

function decodeManifestUrl(encodedManifestUrl) {
  if (!encodedManifestUrl) {
    throw new BadRequestError("encodedManifestUrl is required");
  }

  try {
    return normalizeManifestUrl(
      Buffer.from(encodedManifestUrl, "base64url").toString("utf8")
    );
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError("encodedManifestUrl is invalid");
  }
}

function resolveUpstreamUrl({ manifestUrl, proxyRequestUrl }) {
  const proxyUrl = new URL(proxyRequestUrl, PROXY_REQUEST_BASE_URL);
  const resourcePath = proxyUrl.pathname.replace(/^\/+/, "");

  if (!resourcePath || resourcePath === "manifest.json") {
    const upstreamUrl = new URL(manifestUrl);

    for (const [key, value] of proxyUrl.searchParams) {
      upstreamUrl.searchParams.append(key, value);
    }

    return upstreamUrl.href;
  }

  const baseUrl = new URL(".", manifestUrl);
  const upstreamUrl = new URL(resourcePath, baseUrl);
  upstreamUrl.search = proxyUrl.search;

  return upstreamUrl.href;
}

function pickForwardedHeaders(request) {
  const headers = {};

  for (const name of FORWARDED_REQUEST_HEADERS) {
    if (request.headers[name]) {
      headers[name] = request.headers[name];
    }
  }

  return headers;
}

function copyUpstreamResponseHeaders(upstream, response) {
  response.status(upstream.status);

  for (const name of COPIED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);

    if (value) {
      response.setHeader(name, value);
    }
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
