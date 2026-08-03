import { DiscoveryCoordinator } from "./discovery-coordinator.js";
import { DiscoveryManager } from "./discovery-manager.js";
import { DeviceRegistry } from "./device-registry.js";

const SCAN_SECONDS = 5;

const discoveryManager = new DiscoveryManager({
  searchInterval: 5000
});
const deviceRegistry = new DeviceRegistry();
const coordinator = new DiscoveryCoordinator(discoveryManager, deviceRegistry);

coordinator.on("error", (error) => {
  console.error("SSDP error:", error.message);
});

const unsubscribe = await coordinator.subscribe((message) => {
  if (message.type === "device") {
    printDevice(message.device);
  }
});

setTimeout(async () => {
  unsubscribe();
  printResults(deviceRegistry.listDevices());
}, SCAN_SECONDS * 1000);

function printDevice(device) {
  console.log(`Bulundu: ${device.name || device.udn}`);
}

function printResults(devices) {
  const rows = devices.map((device) => ({
    udn: device.udn,
    name: device.name,
    manufacturer: device.manufacturer,
    modelName: device.modelName,
    online: device.online,
    serviceCount: device.services.length
  }));

  if (rows.length === 0) {
    console.log("Cihaz bulunamadi.");
    return;
  }

  console.table(rows);
}
