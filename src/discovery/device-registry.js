import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export class DeviceRegistry extends EventEmitter {
  constructor() {
    super();

    this.devicesById = new Map();
    this.deviceIdByUsn = new Map();
    this.deviceIdByFingerprint = new Map();
  }

  addService(service, runId) {
    if (!runId) {
      throw new TypeError("runId is required");
    }

    const candidate = toCandidate(service);

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

    const firstSeenInRun = device.lastSeenRunId !== runId;
    device.lastSeenRunId = runId;

    device.services.set(candidate.usn, {
      location: candidate.location,
      serviceType: candidate.serviceType
    });

    this.deviceIdByUsn.set(candidate.usn, device.id);
    this.reindexFingerprint(device, previousFingerprint);
    
    const snapshot = toSnapshot(device);

    if (isNew || firstSeenInRun) {
      this.emit("device:added", {
        runId,
        device: snapshot
      });
    } else if (!snapshotsEqual(previousSnapshot, snapshot)) {
      this.emit("device:updated", {
        runId,
        device: snapshot
      });
    }

    return snapshot;
  }

  listDevices(runId) {
    if (!runId) {
      return [];
    }

    return [...this.devicesById.values()]
      .filter((device) => device.lastSeenRunId === runId)
      .map(toSnapshot);
  }

  getDeviceById(deviceId) {
    return this.devicesById.get(deviceId);
  }

  clear() {
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
}

function createDevice(candidate) {
  return {
    id: randomUUID(),
    friendlyName: candidate.friendlyName,
    ipAddress: candidate.ipAddress,
    lastSeenRunId: null,
    services: new Map()
  };
}

function toCandidate(service) {
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
    fingerprint: createDeviceFingerprint(friendlyName, ipAddress)
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
