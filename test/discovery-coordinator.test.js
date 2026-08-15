import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { DiscoveryCoordinator } from "../src/discovery/discovery-coordinator.js";
import { DeviceRegistry } from "../src/discovery/device-registry.js";

test("keeps the last run list after stop and ignores stale run events", async (t) => {
  const manager = new FakeDiscoveryManager();
  const registry = new DeviceRegistry();
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: 0
  });
  t.after(async () => {
    await manager.stop();
    registry.clear();
  });

  const firstMessages = [];
  const unsubscribeFirst = await coordinator.subscribe((message) => {
    firstMessages.push(message);
  });
  const firstRunId = manager.runId;

  manager.emit("service", {
    runId: firstRunId,
    service: createService()
  });

  const firstDevice = coordinator.listDevices()[0];
  assert.ok(firstDevice);

  unsubscribeFirst();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(manager.running, false);
  assert.deepEqual(coordinator.listDevices(), [firstDevice]);

  const secondMessages = [];
  const unsubscribeSecond = await coordinator.subscribe((message) => {
    secondMessages.push(message);
  });
  const secondRunId = manager.runId;

  assert.notEqual(secondRunId, firstRunId);
  assert.deepEqual(secondMessages, [
    {
      type: "snapshot",
      devices: []
    }
  ]);

  manager.emit("service", {
    runId: firstRunId,
    service: createService()
  });
  assert.equal(secondMessages.length, 1);

  manager.emit("service", {
    runId: secondRunId,
    service: createService()
  });

  assert.equal(secondMessages.length, 2);
  assert.equal(secondMessages[1].type, "device.added");
  assert.equal(secondMessages[1].device.id, firstDevice.id);

  unsubscribeSecond();
});

class FakeDiscoveryManager extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.runId = null;
  }

  async start(runId) {
    this.runId = runId;
    this.running = true;
  }

  async stop() {
    this.running = false;
  }
}

function createService() {
  return {
    uniqueServiceName: "service-a",
    location: new URL("http://192.168.1.24:8080/description.xml"),
    serviceType: "urn:schemas-upnp-org:device:MediaRenderer:1",
    details: {
      device: {
        friendlyName: "Living Room TV"
      }
    }
  };
}
