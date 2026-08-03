import { EventEmitter } from "node:events";
import crypto from "node:crypto";

export class DeviceRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.devicesById = new Map();
    this.deviceIdByUsn = new Map();
    this.deviceIdByGroupKey = new Map();
    this.seenRecentlyMs = options.seenRecentlyMs ?? 30000;
  }

  addService(service) {
    const candidate = toCandidate(service);

    if (!candidate.usn || !candidate.groupKey) {
      return;
    }

    const device = this.findOrCreateDevice(candidate);
    const wasOnline = isOnline(device);

    device.name = device.name || candidate.name;
    device.manufacturer = device.manufacturer || candidate.manufacturer;
    device.modelName = device.modelName || candidate.modelName;
    device.ip = candidate.ip || device.ip;
    device.location = candidate.location || device.location;
    device.lastSeenAt = Date.now();
    device.onlineUntil = device.lastSeenAt + this.seenRecentlyMs;
    device.usns.add(candidate.usn);
    if (candidate.udn) device.udns.add(candidate.udn);
    if (candidate.location) device.locations.add(candidate.location);
    device.services.set(candidate.serviceType, {
      serviceType: candidate.serviceType,
      uniqueServiceName: candidate.usn,
      expires: normalizeExpires(service.expires)
    });

    this.deviceIdByUsn.set(candidate.usn, device.id);
    this.deviceIdByGroupKey.set(candidate.groupKey, device.id);
    this.scheduleOfflineUpdate(device);

    const snapshot = toSnapshot(device);
    const fingerprint = getFingerprint(snapshot);

    if (!wasOnline || fingerprint !== device.lastEmittedFingerprint) {
      device.lastEmittedFingerprint = fingerprint;
      this.emit("device", snapshot);
    }

    return snapshot;
  }

  listDevices() {
    return [...this.devicesById.values()].map(toSnapshot);
  }

  clear() {
    for (const device of this.devicesById.values()) {
      clearTimeout(device.offlineTimer);
    }

    this.devicesById.clear();
    this.deviceIdByUsn.clear();
    this.deviceIdByGroupKey.clear();
    this.emit("clear");
  }

  findOrCreateDevice(candidate) {
    const existingId = this.deviceIdByUsn.get(candidate.usn) ?? this.deviceIdByGroupKey.get(candidate.groupKey);

    if (existingId) {
      return this.devicesById.get(existingId);
    }

    const device = {
      id: crypto.randomUUID(),
      name: "",
      manufacturer: "",
      modelName: "",
      ip: "",
      location: "",
      services: new Map(),
      usns: new Set(),
      udns: new Set(),
      locations: new Set(),
      lastSeenAt: 0,
      onlineUntil: 0,
      offlineTimer: null,
      lastEmittedFingerprint: ""
    };

    this.devicesById.set(device.id, device);
    return device;
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

function toCandidate(service) {
  const details = service.details?.device ?? {};
  const location = service.location?.toString() ?? "";
  const ip = service.location?.hostname ?? "";
  const name = details.friendlyName ?? "";
  const manufacturer = details.manufacturer ?? "";

  return {
    usn: service.uniqueServiceName,
    udn: details.UDN ?? extractUdn(service.uniqueServiceName),
    serviceType: service.serviceType,
    location,
    ip,
    name,
    manufacturer,
    modelName: details.modelName ?? "",
    groupKey: getGroupKey(ip, name, manufacturer)
  };
}

function extractUdn(uniqueServiceName) {
  if (!uniqueServiceName) {
    return undefined;
  }

  return uniqueServiceName.split("::")[0];
}

function getGroupKey(ip, name, manufacturer) {
  if (!ip || !name || !manufacturer) {
    return "";
  }

  return `${ip}|${name}|${manufacturer}`.toLowerCase();
}

function toSnapshot(device) {
  return {
    id: device.id,
    databaseId: null,
    name: device.name,
    manufacturer: device.manufacturer,
    modelName: device.modelName,
    ip: device.ip,
    location: device.location,
    online: device.onlineUntil > Date.now(),
    lastSeenAt: device.lastSeenAt,
    usns: [...device.usns],
    udns: [...device.udns],
    locations: [...device.locations],
    services: [...device.services.values()]
  };
}

function isOnline(device) {
  return device.onlineUntil > Date.now();
}

function normalizeExpires(expires) {
  return Number.isFinite(expires) ? expires : 0;
}

function getFingerprint(device) {
  return JSON.stringify({
    id: device.id,
    databaseId: device.databaseId,
    name: device.name,
    manufacturer: device.manufacturer,
    modelName: device.modelName,
    ip: device.ip,
    location: device.location,
    online: device.online,
    usns: [...device.usns].sort(),
    udns: [...device.udns].sort(),
    locations: [...device.locations].sort(),
    services: device.services.map((service) => service.serviceType).sort()
  });
}
