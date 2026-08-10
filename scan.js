import { createApp } from "./src/app.js";

const SCAN_SECONDS = 5;

const app = createApp();

app.discovery.onError((error) => {
  console.error("SSDP error:", error.message);
});

const unsubscribe = await app.discovery.subscribe((message) => {
  if (message.type === "device.added") {
    printDevice(message.device);
  }
});

setTimeout(async () => {
  unsubscribe();
  printResults(app.discovery.listDevices());
}, SCAN_SECONDS * 1000);

function printDevice(device) {
  console.log(`Bulundu: ${device.friendlyName || device.id}`);
}

function printResults(devices) {
  const rows = devices.map((device) => ({
    id: device.id,
    friendlyName: device.friendlyName,
    ipAddress: device.ipAddress
  }));

  if (rows.length === 0) {
    console.log("Cihaz bulunamadi.");
    return;
  }

  console.table(rows);
}
