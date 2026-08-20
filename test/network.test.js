import assert from "node:assert/strict";
import { test } from "node:test";
import { findLanIpv4Address } from "../src/common/network.js";

test("prefers 192.168 private IPv4 addresses", () => {
  assert.equal(
    findLanIpv4Address({
      vpn: [
        {
          family: "IPv4",
          internal: false,
          address: "10.8.0.2"
        }
      ],
      lan: [
        {
          family: "IPv4",
          internal: false,
          address: "192.168.1.20"
        }
      ]
    }),
    "192.168.1.20"
  );
});

test("falls back to the first other RFC1918 private IPv4 address", () => {
  assert.equal(
    findLanIpv4Address({
      vpn: [
        {
          family: "IPv4",
          internal: false,
          address: "10.8.0.2"
        }
      ],
      lan: [
        {
          family: "IPv4",
          internal: false,
          address: "172.20.0.4"
        }
      ]
    }),
    "10.8.0.2"
  );
});

test("ignores non-private 172 IPv4 addresses for private fallback", () => {
  assert.equal(
    findLanIpv4Address({
      public: [
        {
          family: "IPv4",
          internal: false,
          address: "172.32.0.4"
        }
      ],
      lan: [
        {
          family: "IPv4",
          internal: false,
          address: "203.0.113.10"
        }
      ]
    }),
    "172.32.0.4"
  );
});
