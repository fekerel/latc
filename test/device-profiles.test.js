import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackModule } from "../src/playback/index.js";

test("returns a default effective profile for a resolved device", async () => {
  const playback = createPlaybackModule({
    resolveDeviceIdentifier: async () => ({
      status: "ready",
      identifier: "device-key-1"
    })
  });

  const result = await playback.deviceProfiles.getProfileForDevice(
    "registry-device-1"
  );

  assert.deepEqual(result, {
    status: "ready",
    profile: {
      deviceKey: "device-key-1",
      control: {
        kind: "upnp-avtransport",
        config: {}
      },
      delivery: {
        kind: "direct",
        config: {}
      }
    }
  });
  assert.deepEqual(playback.deviceProfiles.listProfiles(), []);
});

test("saves a device profile by the resolved device key", async () => {
  const playback = createPlaybackModule({
    resolveDeviceIdentifier: async () => ({
      status: "ready",
      identifier: "device-key-1"
    })
  });

  const result = await playback.deviceProfiles.saveProfileForDevice(
    "registry-device-1",
    {
      deviceKey: "ignored-device-key",
      control: {
        kind: "upnp-avtransport",
        config: {
          serviceIdentifier: "service-a"
        }
      },
      delivery: {
        kind: "direct",
        config: {
          passthrough: true
        }
      }
    }
  );

  assert.equal(result.status, "ready");
  assert.equal(result.profile.deviceKey, "device-key-1");
  assert.deepEqual(playback.deviceProfiles.listProfiles(), [result.profile]);
});

test("passes through unresolved device identifier results", async () => {
  const playback = createPlaybackModule({
    resolveDeviceIdentifier: async () => ({
      status: "pending",
      reason: "identifier_not_available"
    })
  });

  assert.deepEqual(
    await playback.deviceProfiles.getProfileForDevice("registry-device-1"),
    {
      status: "pending",
      reason: "identifier_not_available"
    }
  );
});
