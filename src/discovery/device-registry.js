import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export class DeviceRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.seenRecentlyMs = options.seenRecentlyMs ?? 30000;
    this.devicesById = new Map();
    this.deviceIdByUsn = new Map();
    this.deviceIdByFingerprint = new Map();
    this.expiryTimersByDeviceId = new Map();
  }

  addService(service) {
    const candidate = toCandidate(service, this.seenRecentlyMs);

    if (!candidate.usn) {
      return;
    }

    let device = this.findDeviceByUsn(candidate.usn);

    if (!device && candidate.fingerprint) {
      device = this.findDeviceByFingerprint(candidate.fingerprint);
    }

    const isNew = !device;

    if (!device) {
      device = createDevice(candidate);
      this.devicesById.set(device.id, device);
    }

    const wasOnline = device.online;
    const previousSnapshot = toSnapshot(device);
    const previousFingerprint = createDeviceFingerprint(
      device.friendlyName,
      device.ipAddress
    );

    if (candidate.friendlyName) {
      device.friendlyName = candidate.friendlyName;
    }

    if (candidate.ipAddress) {
      device.ipAddress = candidate.ipAddress;
    }

    device.online = true;
    device.services.set(candidate.usn, {
      location: candidate.location,
      serviceType: candidate.serviceType,
      online: true,
      lastSeenAt: candidate.seenAt,
      expiresAt: candidate.expiresAt
    });

    this.deviceIdByUsn.set(candidate.usn, device.id);
    this.reindexFingerprint(device, previousFingerprint);
    this.scheduleNextExpiry(device);

    const snapshot = toSnapshot(device);

    if (isNew || !wasOnline) {
      this.emit("device:added", snapshot);
    } else if (!snapshotsEqual(previousSnapshot, snapshot)) {
      this.emit("device:updated", snapshot);
    }

    return snapshot;
  }

  removeService(usn, reason = "byebye") {
    const device = this.findDeviceByUsn(usn);
    const service = device?.services.get(usn);

    if (!device || !service || !service.online) {
      return;
    }

    service.online = false;
    service.expiresAt = Date.now();

    this.updateDeviceAvailability(device, reason);
  }

  listDevices() {
    return [...this.devicesById.values()]
      .filter((device) => device.online)
      .map(toSnapshot);
  }

  clear() {
    for (const timer of this.expiryTimersByDeviceId.values()) {
      clearTimeout(timer);
    }

    this.expiryTimersByDeviceId.clear();
    this.deviceIdByFingerprint.clear();
    this.deviceIdByUsn.clear();
    this.devicesById.clear();
  }

  findDeviceByUsn(usn) {
    const deviceId = this.deviceIdByUsn.get(usn);
    return deviceId ? this.devicesById.get(deviceId) : undefined;
  }

  findDeviceByFingerprint(fingerprint) {
    const deviceId = this.deviceIdByFingerprint.get(fingerprint);
    return deviceId ? this.devicesById.get(deviceId) : undefined;
  }

  reindexFingerprint(device, previousFingerprint) {
    const nextFingerprint = createDeviceFingerprint(
      device.friendlyName,
      device.ipAddress
    );

    if (
      previousFingerprint &&
      previousFingerprint !== nextFingerprint &&
      this.deviceIdByFingerprint.get(previousFingerprint) === device.id
    ) {
      this.deviceIdByFingerprint.delete(previousFingerprint);
    }

    if (nextFingerprint) {
      this.deviceIdByFingerprint.set(nextFingerprint, device.id);
    }
  }

  scheduleNextExpiry(device) {
    this.clearExpiryTimer(device.id);

    const onlineServices = [...device.services.values()].filter(
      (service) => service.online
    );

    if (onlineServices.length === 0) {
      return;
    }

    const nextExpiry = Math.min(
      ...onlineServices.map((service) => service.expiresAt)
    );
    const delayMs = Math.min(
      Math.max(nextExpiry - Date.now(), 0),
      MAX_TIMER_DELAY_MS
    );

    const timer = setTimeout(() => {
      if (this.expiryTimersByDeviceId.get(device.id) !== timer) {
        return;
      }

      this.expiryTimersByDeviceId.delete(device.id);
      this.expireServices(device.id);
    }, delayMs);

    this.expiryTimersByDeviceId.set(device.id, timer);
  }

  expireServices(deviceId) {
    const device = this.devicesById.get(deviceId);

    if (!device) {
      return;
    }

    const now = Date.now();

    for (const service of device.services.values()) {
      if (service.online && service.expiresAt <= now) {
        service.online = false;
      }
    }

    this.updateDeviceAvailability(device, "expired");
  }

  updateDeviceAvailability(device, reason) {
    const hasOnlineService = [...device.services.values()].some(
      (service) => service.online
    );

    if (hasOnlineService) {
      this.scheduleNextExpiry(device);
      return;
    }

    this.clearExpiryTimer(device.id);

    if (!device.online) {
      return;
    }

    device.online = false;
    this.emit("device:removed", {
      deviceId: device.id,
      reason
    });
  }

  clearExpiryTimer(deviceId) {
    const timer = this.expiryTimersByDeviceId.get(deviceId);

    if (timer) {
      clearTimeout(timer);
      this.expiryTimersByDeviceId.delete(deviceId);
    }
  }
}

function createDevice(candidate) {
  return {
    id: randomUUID(),
    friendlyName: candidate.friendlyName,
    ipAddress: candidate.ipAddress,
    online: false,
    services: new Map()
  };
}

function toCandidate(service, seenRecentlyMs) {
  const seenAt = Date.now();
  const expiresAt = Number.isFinite(service.expires)
    ? service.expires
    : seenAt + seenRecentlyMs;
  const friendlyName = normalizeDisplayName(
    service.details?.device?.friendlyName
  );
  const ipAddress = extractIpAddress(service.location);

  return {
    usn: service.uniqueServiceName ?? "",
    location: normalizeLocationHref(service.location),
    serviceType:
      typeof service.serviceType === "string" ? service.serviceType : "",
    friendlyName,
    ipAddress,
    fingerprint: createDeviceFingerprint(friendlyName, ipAddress),
    seenAt,
    expiresAt
  };
}

function normalizeLocationHref(location) {
  if (location instanceof URL) {
    return location.href;
  }

  if (!location) {
    return "";
  }

  try {
    return new URL(location).href;
  } catch {
    return "";
  }
}

function extractIpAddress(location) {
  if (location instanceof URL) {
    return location.hostname;
  }

  if (!location) {
    return "";
  }

  try {
    return new URL(location).hostname;
  } catch {
    return "";
  }
}

function normalizeDisplayName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeFriendlyName(value) {
  return normalizeDisplayName(value).toLowerCase();
}

function createDeviceFingerprint(friendlyName, ipAddress) {
  const normalizedName = normalizeFriendlyName(friendlyName);

  if (!normalizedName || !ipAddress) {
    return "";
  }

  return `${normalizedName}\u0000${ipAddress}`;
}

function toSnapshot(device) {
  return {
    id: device.id,
    friendlyName: device.friendlyName,
    ipAddress: device.ipAddress
  };
}

function snapshotsEqual(left, right) {
  return (
    left.id === right.id &&
    left.friendlyName === right.friendlyName &&
    left.ipAddress === right.ipAddress
  );
}
