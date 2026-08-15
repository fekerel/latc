import assert from "node:assert/strict";
import { test } from "node:test";
import { DeviceRegistry } from "../src/discovery/device-registry.js";

test("groups different USNs by friendly name and IP address", (t) => {
  const registry = new DeviceRegistry();
  t.after(() => registry.clear());

  const added = [];
  registry.on("device:added", (device) => added.push(device));

  registry.addService(createService({ usn: "service-a" }));
  registry.addService(createService({ usn: "service-b" }));

  assert.equal(added.length, 1);
  assert.equal(registry.listDevices().length, 1);
  assert.equal(registry.deviceIdByUsn.get("service-a"), added[0].id);
  assert.equal(registry.deviceIdByUsn.get("service-b"), added[0].id);
});

test("keeps the device ID when a known USN arrives from a different IP", (t) => {
  const registry = new DeviceRegistry();
  t.after(() => registry.clear());

  const updated = [];
  const firstSnapshot = registry.addService(createService({ usn: "service-a" }));
  registry.on("device:updated", (device) => updated.push(device));

  registry.addService(
    createService({
      usn: "service-a",
      ipAddress: "192.168.1.31"
    })
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, firstSnapshot.id);
  assert.equal(updated[0].ipAddress, "192.168.1.31");
});

test("stores and refreshes the service location and type", (t) => {
  const registry = new DeviceRegistry();
  t.after(() => registry.clear());

  const device = registry.addService(
    createService({
      usn: "service-a",
      locationPath: "/first-description.xml",
      serviceType: "urn:schemas-upnp-org:device:MediaRenderer:1"
    })
  );

  let service = registry.devicesById.get(device.id).services.get("service-a");

  assert.equal(
    service.location,
    "http://192.168.1.24:8080/first-description.xml"
  );
  assert.equal(
    service.serviceType,
    "urn:schemas-upnp-org:device:MediaRenderer:1"
  );

  registry.addService(
    createService({
      usn: "service-a",
      locationPath: "/second-description.xml",
      serviceType: "urn:schemas-upnp-org:service:AVTransport:1"
    })
  );

  service = registry.devicesById.get(device.id).services.get("service-a");

  assert.equal(
    service.location,
    "http://192.168.1.24:8080/second-description.xml"
  );
  assert.equal(
    service.serviceType,
    "urn:schemas-upnp-org:service:AVTransport:1"
  );
});

test("removes a device only after its last online service is removed", (t) => {
  const registry = new DeviceRegistry();
  t.after(() => registry.clear());

  const removed = [];
  registry.on("device:removed", (event) => removed.push(event));

  const device = registry.addService(createService({ usn: "service-a" }));
  registry.addService(createService({ usn: "service-b" }));

  registry.removeService("service-a");
  assert.equal(removed.length, 0);
  assert.equal(registry.listDevices().length, 1);

  registry.removeService("service-b");
  assert.deepEqual(removed, [
    {
      deviceId: device.id,
      reason: "byebye"
    }
  ]);
  assert.deepEqual(registry.listDevices(), []);
});

test("adds an offline device again with the same ID", (t) => {
  const registry = new DeviceRegistry();
  t.after(() => registry.clear());

  const added = [];
  registry.on("device:added", (device) => added.push(device));

  registry.addService(createService({ usn: "service-a" }));
  registry.removeService("service-a");
  registry.addService(createService({ usn: "service-a" }));

  assert.equal(added.length, 2);
  assert.equal(added[1].id, added[0].id);
});

test("expires a device when all of its services reach max-age", async (t) => {
  const registry = new DeviceRegistry();
  t.after(() => registry.clear());

  const removed = [];
  registry.on("device:removed", (event) => removed.push(event));

  const device = registry.addService(
    createService({
      usn: "service-a",
      expires: Date.now()
    })
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(removed, [
    {
      deviceId: device.id,
      reason: "expired"
    }
  ]);
  assert.deepEqual(registry.listDevices(), []);
});

function createService({
  usn,
  friendlyName = "Living Room TV",
  ipAddress = "192.168.1.24",
  locationPath = "/description.xml",
  serviceType = "urn:schemas-upnp-org:device:MediaRenderer:1",
  expires = Date.now() + 60000
}) {
  return {
    uniqueServiceName: usn,
    location: new URL(`http://${ipAddress}:8080${locationPath}`),
    serviceType,
    details: {
      device: {
        friendlyName
      }
    },
    expires
  };
}
