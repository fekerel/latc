import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

class NoopPersistedIdentityIndex {
  findDeviceIdByUsn() {
    return null;
  }

  learnUsnsForPersistedDevice() {}
}

export class DeviceRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    /*
      DeviceRegistry answers this question:

        "During the current discovery session, which live devices have we seen?"

      It does not write to the database directly.

      Persistence-related work is delegated to persistedIdentityIndex. That
      object represents the database's RAM mirror and write queue.

      Expected persistedIdentityIndex contract:

        findDeviceIdByUsn(usn) -> persistedDeviceId | null

        learnUsnsForPersistedDevice({
          persistedDeviceId,
          usns
        })

      The second function may synchronously update its RAM map and enqueue
      missing DB writes in its own module.
    */
    this.persistedIdentityIndex =
      options.persistedIdentityIndex ?? new NoopPersistedIdentityIndex();

    this.seenRecentlyMs = options.seenRecentlyMs ?? 30000;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 1500;

    /*
      Runtime device storage.

      devicesById:
        runtimeDeviceId -> runtimeDevice

      deviceIdByUsn:
        usn -> runtimeDeviceId

      deviceIdByGroupKey:
        ip + friendlyName + manufacturer -> runtimeDeviceId

      Runtime device stores its current groupKey. If that key changes after a
      later observation, the old entry is removed from deviceIdByGroupKey before
      the new one is stored.

      offlineTimersByDeviceId:
        runtimeDeviceId -> timeout handle
    */
    this.devicesById = new Map();
    this.deviceIdByUsn = new Map();
    this.deviceIdByGroupKey = new Map();
    this.offlineTimersByDeviceId = new Map();
  }

  handleServiceForDeviceRegistry(service) {
    /*
      The incoming SSDP service response is first normalized into a single
      observation.

      Observation shape:

        {
          usn,
          location,
          friendlyName,
          manufacturer,
          ip,
          seenAt
        }

      Observation is not a device. It is one message about one service.
    */
    const observation = this.normalizeService(service);

    if (!observation) {
      return;
    }

    /*
      Matching order:

      1. Strong runtime match by USN.
      2. Weaker session-only match by group key.
      3. No match: create a new runtime device.

      We intentionally ignore UDN for now.
    */
    let device = this.findByUsn(observation.usn);
    let matchedByGroupKey = false;

    if (!device) {
      device = this.findByGroupKey(observation);
      matchedByGroupKey = device !== null;
    }

    if (!device) {
      device = this.createRuntimeDevice(observation);
    }

    /*
      Whether we found the device by USN, group key, or had to create it, we
      still ask the persistence RAM mirror if this USN belongs to a saved
      device.
    */
    const persistedDeviceId = this.persistedIdentityIndex.findDeviceIdByUsn(
      observation.usn
    );

    if (persistedDeviceId) {
      device.persistedDeviceId = persistedDeviceId;
    }

    const before = this.toFingerprint(device);

    this.mergeObservationIntoDevice(device, observation);
    this.indexObservationForDevice(device, observation);

    /*
      Important case:

      - The incoming USN was not known in this registry.
      - But the service matched an existing runtime device by group key.
      - That runtime device is already linked to a persisted device.

      In that case, every USN currently known for the runtime device should be
      offered to the persistence identity index. That object decides which USNs
      are new, updates its RAM map immediately, and queues DB writes.
    */
    if (matchedByGroupKey && device.persistedDeviceId) {
      this.persistedIdentityIndex.learnUsnsForPersistedDevice({
        persistedDeviceId: device.persistedDeviceId,
        usns: device.usns
      });
    }

    this.scheduleOfflineUpdate(device);

    const after = this.toFingerprint(device);

    if (before !== after) {
      this.emit("device", this.toSnapshot(device));
    }
  }

  listDevices() {
    return Array.from(this.devicesById.values()).map((device) => {
      return this.toSnapshot(device);
    });
  }

  clear() {
    for (const timer of this.offlineTimersByDeviceId.values()) {
      clearTimeout(timer);
    }

    this.devicesById.clear();
    this.deviceIdByUsn.clear();
    this.deviceIdByGroupKey.clear();
    this.offlineTimersByDeviceId.clear();
  }

  normalizeService(service) {
    const usn = service.uniqueServiceName;
    const location = this.normalizeLocation(service.location);
    const ip = this.extractIp(location);
    const friendlyName = this.normalizeString(service.details?.friendlyName);
    const manufacturer = this.normalizeString(service.details?.manufacturer);

    if (!usn || !location || !ip) {
      return null;
    }

    return {
      usn,
      location,
      friendlyName,
      manufacturer,
      ip,
      seenAt: Date.now()
    };
  }

  findByUsn(usn) {
    const deviceId = this.deviceIdByUsn.get(usn);

    if (!deviceId) {
      return null;
    }

    return this.devicesById.get(deviceId) ?? null;
  }

  findByGroupKey(observation) {
    const groupKey = this.toGroupKey(observation);

    if (!groupKey) {
      return null;
    }

    const deviceId = this.deviceIdByGroupKey.get(groupKey);

    if (!deviceId) {
      return null;
    }

    return this.devicesById.get(deviceId) ?? null;
  }

  createRuntimeDevice(observation) {
    const device = {
      id: randomUUID(),
      persistedDeviceId: null,
      usns: new Set(),
      locationsByUsn: new Map(),
      groupKey: null,
      friendlyName: observation.friendlyName,
      manufacturer: observation.manufacturer,
      ip: observation.ip,
      lastSeenAt: observation.seenAt,
      onlineUntil: observation.seenAt + this.seenRecentlyMs,
      online: true
    };

    this.devicesById.set(device.id, device);

    return device;
  }

  mergeObservationIntoDevice(device, observation) {
    device.usns.add(observation.usn);
    device.locationsByUsn.set(observation.usn, observation.location);

    device.friendlyName = observation.friendlyName ?? device.friendlyName;
    device.manufacturer = observation.manufacturer ?? device.manufacturer;
    device.ip = observation.ip;
    device.lastSeenAt = observation.seenAt;
    device.onlineUntil = observation.seenAt + this.seenRecentlyMs;
    device.online = true;
  }

  indexObservationForDevice(device, observation) {
    this.deviceIdByUsn.set(observation.usn, device.id);

    const groupKey = this.toGroupKey(observation);

    if (groupKey === device.groupKey) {
      return;
    }

    if (device.groupKey) {
      this.deviceIdByGroupKey.delete(device.groupKey);
    }

    device.groupKey = groupKey;

    if (device.groupKey) {
      this.deviceIdByGroupKey.set(device.groupKey, device.id);
    }
  }

  scheduleOfflineUpdate(device) {
    const existingTimer = this.offlineTimersByDeviceId.get(device.id);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const delayMs = Math.max(device.onlineUntil - Date.now(), 0);
    const scheduledOnlineUntil = device.onlineUntil;

    const timer = setTimeout(() => {
      this.offlineTimersByDeviceId.delete(device.id);

      this.verifyPresenceAfterSilence(device, scheduledOnlineUntil).catch(
        (error) => {
          this.emit("error", error);
        }
      );
    }, delayMs);

    this.offlineTimersByDeviceId.set(device.id, timer);
  }

  async verifyPresenceAfterSilence(device, scheduledOnlineUntil) {
    if (this.isStalePresenceCheck(device, scheduledOnlineUntil)) {
      return;
    }

    const location = this.getFirstLocation(device);
    const reachable = location ? await this.probeLocation(location) : false;

    if (this.isStalePresenceCheck(device, scheduledOnlineUntil)) {
      return;
    }

    if (reachable) {
      device.online = true;
      device.onlineUntil = Date.now() + this.seenRecentlyMs;
      this.scheduleOfflineUpdate(device);
      return;
    }

    this.markOffline(device);
  }

  isStalePresenceCheck(device, scheduledOnlineUntil) {
    return (
      !this.devicesById.has(device.id) ||
      device.onlineUntil !== scheduledOnlineUntil
    );
  }

  getFirstLocation(device) {
    return device.locationsByUsn.values().next().value ?? null;
  }

  async probeLocation(location) {
    try {
      const response = await fetch(location, {
        signal: AbortSignal.timeout(this.probeTimeoutMs)
      });

      await response.body?.cancel();

      return true;
    } catch {
      return false;
    }
  }

  markOffline(device) {
    if (!device.online) {
      return;
    }

    device.online = false;
    this.emit("device", this.toSnapshot(device));
  }

  toSnapshot(device) {
    return {
      id: device.id,
      persistedDeviceId: device.persistedDeviceId,
      friendlyName: device.friendlyName,
      manufacturer: device.manufacturer,
      ip: device.ip,
      online: device.online,
      lastSeenAt: device.lastSeenAt,
      usns: Array.from(device.usns),
      locationsByUsn: Object.fromEntries(device.locationsByUsn)
    };
  }

  toFingerprint(device) {
    return JSON.stringify(this.toSnapshot(device));
  }

  toGroupKey(observation) {
    if (!observation.ip || !observation.friendlyName || !observation.manufacturer) {
      return null;
    }

    return [
      observation.ip,
      observation.friendlyName,
      observation.manufacturer
    ]
      .map((value) => value.trim().toLowerCase())
      .join("|");
  }

  normalizeLocation(location) {
    if (!location) {
      return null;
    }

    return location.toString();
  }

  extractIp(location) {
    try {
      return new URL(location).hostname;
    } catch {
      return null;
    }
  }

  normalizeString(value) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
  }
}
