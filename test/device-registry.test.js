import assert from "node:assert/strict";
import { test } from "node:test";
import { DeviceRegistry } from "../src/discovery/device-registry.js";

test("groups different USNs by friendly name and IP address", (t) => {
  const registry = new DeviceRegistry();
  const runId = "run-1";
  t.after(() => registry.clear());

  const added = [];
  registry.on("device:added", (event) => added.push(event));

  registry.addService(createService({ usn: "service-a" }), runId);
  registry.addService(createService({ usn: "service-b" }), runId);

  assert.equal(added.length, 1);
  assert.equal(added[0].runId, runId);
  assert.equal(registry.listDevices(runId).length, 1);
  assert.equal(registry.deviceIdByUsn.get("service-a"), added[0].device.id);
  assert.equal(registry.deviceIdByUsn.get("service-b"), added[0].device.id);
});

test("keeps the device ID when a known USN arrives from a different IP", (t) => {
  const registry = new DeviceRegistry();
  const runId = "run-1";
  t.after(() => registry.clear());

  const updated = [];
  const firstSnapshot = registry.addService(
    createService({ usn: "service-a" }),
    runId
  );
  registry.on("device:updated", (event) => updated.push(event));

  registry.addService(
    createService({
      usn: "service-a",
      ipAddress: "192.168.1.31"
    }),
    runId
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].runId, runId);
  assert.equal(updated[0].device.id, firstSnapshot.id);
  assert.equal(updated[0].device.ipAddress, "192.168.1.31");
});

test("stores and refreshes the service location and type", (t) => {
  const registry = new DeviceRegistry();
  const runId = "run-1";
  t.after(() => registry.clear());

  const device = registry.addService(
    createService({
      usn: "service-a",
      locationPath: "/first-description.xml",
      serviceType: "urn:schemas-upnp-org:device:MediaRenderer:1"
    }),
    runId
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
    }),
    runId
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

test("keeps records across runs and lists only the requested run", (t) => {
  const registry = new DeviceRegistry();
  t.after(() => registry.clear());

  const added = [];
  registry.on("device:added", (event) => added.push(event));

  const firstSnapshot = registry.addService(
    createService({ usn: "service-a" }),
    "run-1"
  );

  assert.deepEqual(registry.listDevices("run-2"), []);

  const secondSnapshot = registry.addService(
    createService({ usn: "service-a" }),
    "run-2"
  );

  assert.equal(secondSnapshot.id, firstSnapshot.id);
  assert.equal(registry.devicesById.size, 1);
  assert.deepEqual(registry.listDevices("run-1"), []);
  assert.deepEqual(registry.listDevices("run-2"), [secondSnapshot]);
  assert.deepEqual(
    added.map(({ runId, device }) => ({ runId, deviceId: device.id })),
    [
      { runId: "run-1", deviceId: firstSnapshot.id },
      { runId: "run-2", deviceId: firstSnapshot.id }
    ]
  );
});

test("does not add the same device twice in one run", (t) => {
  const registry = new DeviceRegistry();
  const runId = "run-1";
  t.after(() => registry.clear());

  const added = [];
  registry.on("device:added", (event) => added.push(event));

  registry.addService(createService({ usn: "service-a" }), runId);
  registry.addService(createService({ usn: "service-a" }), runId);

  assert.equal(added.length, 1);
});

test("requires a run ID when adding a service", () => {
  const registry = new DeviceRegistry();

  assert.throws(
    () => registry.addService(createService({ usn: "service-a" })),
    /runId is required/
  );
});

function createService({
  usn,
  friendlyName = "Living Room TV",
  ipAddress = "192.168.1.24",
  locationPath = "/description.xml",
  serviceType = "urn:schemas-upnp-org:device:MediaRenderer:1"
}) {
  return {
    uniqueServiceName: usn,
    location: new URL(`http://${ipAddress}:8080${locationPath}`),
    serviceType,
    details: {
      device: {
        friendlyName
      }
    }
  };
}
