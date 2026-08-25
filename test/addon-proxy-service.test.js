import assert from "node:assert/strict";
import { test } from "node:test";
import { AddonProxyService } from "../src/addon-proxies/addon-proxy-service.js";

test("creates a stateless proxied manifest URL", () => {
  const service = new AddonProxyService({
    getPublicBaseUrl: () => "http://192.168.1.4:3000/"
  });

  assert.match(
    service.createManifestProxyUrl("https://addon.test/manifest.json"),
    /^http:\/\/192\.168\.1\.4:3000\/api\/addon-proxies\/[^/]+\/manifest\.json$/
  );
});

test("proxies manifest requests to the original manifest URL", async () => {
  const fetchCalls = [];
  const manifestUrl = "https://addon.test/root/manifest.json?token=abc";
  const service = new AddonProxyService({
    getPublicBaseUrl: () => "http://latc.test",
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });

      return {
        status: 200,
        headers: new Map([["content-type", "application/json"]])
      };
    }
  });
  const encodedManifestUrl = extractEncodedManifestUrl(
    service.createManifestProxyUrl(manifestUrl)
  );
  const response = createFakeResponse();

  await service.handleRequest({
    encodedManifestUrl,
    request: {
      method: "GET",
      url: "/manifest.json",
      headers: {
        accept: "application/json",
        host: "latc.test"
      }
    },
    response
  });

  assert.deepEqual(fetchCalls, [
    {
      url: manifestUrl,
      options: {
        method: "GET",
        headers: {
          accept: "application/json"
        }
      }
    }
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/json");
  assert.equal(response.ended, true);
});

test("proxies resource requests relative to the manifest directory", async () => {
  const fetchCalls = [];
  const service = new AddonProxyService({
    getPublicBaseUrl: () => "http://latc.test",
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });

      return {
        status: 200,
        headers: new Map([["content-type", "application/json"]])
      };
    }
  });
  const encodedManifestUrl = extractEncodedManifestUrl(
    service.createManifestProxyUrl(
      "https://addon.test/nested/manifest.json?token=abc"
    )
  );
  const response = createFakeResponse();

  await service.handleRequest({
    encodedManifestUrl,
    request: {
      method: "GET",
      url: "/catalog/movie/top.json?skip=0",
      headers: {}
    },
    response
  });

  assert.equal(
    fetchCalls[0].url,
    "https://addon.test/nested/catalog/movie/top.json?skip=0"
  );
});

function extractEncodedManifestUrl(proxyManifestUrl) {
  return new URL(proxyManifestUrl).pathname.split("/").at(-2);
}

function createFakeResponse() {
  return {
    statusCode: undefined,
    headers: {},
    ended: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end() {
      this.ended = true;
    }
  };
}
