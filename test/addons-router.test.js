import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeAddonBaseUrl,
  resolveProxyTargetUrl
} from "../src/api/routers/addons-router.js";

test("normalizes a Stremio manifest URL to an addon base URL", () => {
  assert.equal(
    normalizeAddonBaseUrl("https://addon.example.com/manifest.json"),
    "https://addon.example.com"
  );
  assert.equal(
    normalizeAddonBaseUrl("https://addon.example.com/user/abc/manifest.json?token=secret"),
    "https://addon.example.com/user/abc"
  );
});

test("resolves proxied Stremio addon requests to the addon domain", () => {
  const addonBaseUrl = encodeURIComponent("https://addon.example.com/user/abc");

  assert.equal(
    resolveProxyTargetUrl(`/proxy/${addonBaseUrl}/manifest.json`).href,
    "https://addon.example.com/user/abc/manifest.json"
  );
  assert.equal(
    resolveProxyTargetUrl(`/proxy/${addonBaseUrl}/stream/movie/tt123.json?skip=1`).href,
    "https://addon.example.com/user/abc/stream/movie/tt123.json?skip=1"
  );
});

test("defaults a bare proxy addon URL to the manifest request", () => {
  const addonBaseUrl = encodeURIComponent("https://addon.example.com");

  assert.equal(
    resolveProxyTargetUrl(`/proxy/${addonBaseUrl}`).href,
    "https://addon.example.com/manifest.json"
  );
});
