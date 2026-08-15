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

test("stops only after the last discovery lease is released", async (t) => {
  const manager = new FakeDiscoveryManager();
  const registry = new DeviceRegistry();
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: 0
  });
  t.after(async () => {
    await manager.stop();
    registry.clear();
  });

  const releaseFirst = await coordinator.acquireDiscovery();
  const releaseSecond = await coordinator.acquireDiscovery();

  assert.equal(manager.startCount, 1);
  assert.equal(manager.running, true);

  releaseFirst();
  await delay(10);

  assert.equal(manager.running, true);
  assert.equal(manager.stopCount, 0);

  releaseSecond();
  await delay(10);

  assert.equal(manager.running, false);
  assert.equal(manager.stopCount, 1);

  releaseSecond();
  await delay(10);

  assert.equal(manager.stopCount, 1);
});

class FakeDiscoveryManager extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.runId = null;
    this.startCount = 0;
    this.stopCount = 0;
  }

  async start(runId) {
    this.startCount++;
    this.runId = runId;
    this.running = true;
  }

  async stop() {
    if (this.running) {
      this.stopCount++;
    }

    this.running = false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
