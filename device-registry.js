import { EventEmitter } from "node:events";

export class DeviceRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.devices = new Map();
    this.seenRecentlyMs = options.seenRecentlyMs ?? 30000;
  }

  addService(service) {
    const udn = getUdn(service);

    if (!udn) {
      return;
    }

    const existing = this.devices.get(udn);
    const next = existing ?? {
      udn,
      name: "",
      manufacturer: "",
      modelName: "",
      location: "",
      services: new Map(),
      lastSeenAt: 0,
      onlineUntil: 0,
      offlineTimer: null,
      lastEmittedFingerprint: ""
    };

    const wasOnline = isOnline(next);
    const details = service.details?.device ?? {};
    next.name = next.name || details.friendlyName || "";
    next.manufacturer = next.manufacturer || details.manufacturer || "";
    next.modelName = next.modelName || details.modelName || "";
    next.location = service.location?.toString() ?? next.location;
    next.lastSeenAt = Date.now();
    next.onlineUntil = next.lastSeenAt + this.seenRecentlyMs;
    next.services.set(service.serviceType, {
      serviceType: service.serviceType,
      uniqueServiceName: service.uniqueServiceName,
      expires: service.expires ?? 0
    });
    this.scheduleOfflineUpdate(next);

    this.devices.set(udn, next);
    const snapshot = toSnapshot(next);
    const fingerprint = getFingerprint(snapshot);

    if (!wasOnline || fingerprint !== next.lastEmittedFingerprint) {
      next.lastEmittedFingerprint = fingerprint;
      this.emit("device", snapshot);
    }

    return snapshot;
  }

  listDevices() {
    return [...this.devices.values()].map(toSnapshot);
  }

  clear() {
    for (const device of this.devices.values()) {
      clearTimeout(device.offlineTimer);
    }

    this.devices.clear();
    this.emit("clear");
  }

  scheduleOfflineUpdate(device) {
    clearTimeout(device.offlineTimer);

    const delayMs = Math.max(device.onlineUntil - Date.now(), 0);
    device.offlineTimer = setTimeout(() => {
      if (isOnline(device)) {
        return;
      }

      const snapshot = toSnapshot(device);
      const fingerprint = getFingerprint(snapshot);

      if (fingerprint !== device.lastEmittedFingerprint) {
        device.lastEmittedFingerprint = fingerprint;
        this.emit("device", snapshot);
      }
    }, delayMs);
  }
}

function getUdn(service) {
  return service.details?.device?.UDN ?? extractUdn(service.uniqueServiceName);
}

function extractUdn(uniqueServiceName) {
  if (!uniqueServiceName) {
    return undefined;
  }

  return uniqueServiceName.split("::")[0];
}

function toSnapshot(device) {
  return {
    udn: device.udn,
    name: device.name,
    manufacturer: device.manufacturer,
    modelName: device.modelName,
    location: device.location,
    online: device.onlineUntil > Date.now(),
    lastSeenAt: device.lastSeenAt,
    services: [...device.services.values()]
  };
}

function isOnline(device) {
  return device.onlineUntil > Date.now();
}

function getFingerprint(device) {
  return JSON.stringify({
    udn: device.udn,
    name: device.name,
    manufacturer: device.manufacturer,
    modelName: device.modelName,
    location: device.location,
    online: device.online,
    services: device.services.map((service) => service.serviceType).sort()
  });
}
