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

test("resolves an existing AVTransport service identifier", async (t) => {
  const manager = new FakeDiscoveryManager();
  const registry = new DeviceRegistry();
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: 0
  });
  t.after(async () => {
    await manager.stop();
    registry.clear();
  });

  const release = await coordinator.acquireDiscovery();
  const runId = manager.runId;

  manager.emit("service", {
    runId,
    service: createService({
      usn: "uuid:device-1::urn:schemas-upnp-org:service:AVTransport:1",
      serviceType: "urn:schemas-upnp-org:service:AVTransport:1"
    })
  });

  const deviceId = coordinator.listDevices()[0].id;
  release();

  const result = await coordinator.resolveDeviceIdentifier(deviceId);

  assert.deepEqual(result, {
    status: "ready",
    identifier: "uuid:device-1::urn:schemas-upnp-org:service:AVTransport:1"
  });
  assert.equal(manager.startCount, 1);
});

test("rechecks the AVTransport service identifier after waiting", async (t) => {
  const manager = new FakeDiscoveryManager();
  const registry = new DeviceRegistry();
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: 0
  });
  t.after(async () => {
    await manager.stop();
    registry.clear();
  });

  const release = await coordinator.acquireDiscovery();

  manager.emit("service", {
    runId: manager.runId,
    service: createService({
      usn: "uuid:device-1::urn:schemas-upnp-org:device:MediaRenderer:1",
      serviceType: "urn:schemas-upnp-org:device:MediaRenderer:1"
    })
  });

  const deviceId = coordinator.listDevices()[0].id;
  release();
  await delay(10);

  const resolvingIdentifier = coordinator.resolveDeviceIdentifier(deviceId, {
    timeoutMs: 50
  });

  setTimeout(() => {
    manager.emit("service", {
      runId: manager.runId,
      service: createService({
        usn: "uuid:device-1::urn:schemas-upnp-org:service:AVTransport:1",
        serviceType: "urn:schemas-upnp-org:service:AVTransport:1"
      })
    });
  }, 0);

  assert.deepEqual(await resolvingIdentifier, {
    status: "ready",
    identifier: "uuid:device-1::urn:schemas-upnp-org:service:AVTransport:1"
  });
});

test("returns pending when the AVTransport service identifier is unavailable", async (t) => {
  const manager = new FakeDiscoveryManager();
  const registry = new DeviceRegistry();
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: 0
  });
  t.after(async () => {
    await manager.stop();
    registry.clear();
  });

  const release = await coordinator.acquireDiscovery();

  manager.emit("service", {
    runId: manager.runId,
    service: createService({
      usn: "uuid:device-1::urn:schemas-upnp-org:device:MediaRenderer:1",
      serviceType: "urn:schemas-upnp-org:device:MediaRenderer:1"
    })
  });

  const deviceId = coordinator.listDevices()[0].id;
  release();
  await delay(10);

  const result = await coordinator.resolveDeviceIdentifier(deviceId, {
    timeoutMs: 5
  });

  assert.deepEqual(result, {
    status: "pending",
    reason: "identifier_not_available"
  });
});

test("does not start discovery when resolving an unknown device identifier", async () => {
  const manager = new FakeDiscoveryManager();
  const registry = new DeviceRegistry();
  const coordinator = new DiscoveryCoordinator(manager, registry);

  const result = await coordinator.resolveDeviceIdentifier("missing-device", {
    timeoutMs: 5
  });

  assert.deepEqual(result, {
    status: "not_found"
  });
  assert.equal(manager.startCount, 0);
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

function createService({
  usn = "service-a",
  serviceType = "urn:schemas-upnp-org:device:MediaRenderer:1"
} = {}) {
  return {
    uniqueServiceName: usn,
    location: new URL("http://192.168.1.24:8080/description.xml"),
    serviceType,
    details: {
      device: {
        friendlyName: "Living Room TV"
      }
    }
  };
}
