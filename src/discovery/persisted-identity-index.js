import { EventEmitter } from "node:events";

export class PersistedIdentityIndex extends EventEmitter {
  constructor({ persistedDeviceStore }) {
    super();

    this.persistedDeviceStore = persistedDeviceStore;

    /*
      RAM mirror of persisted_device_usns:

        usn -> persistedDeviceId

      DeviceRegistry uses this map indirectly through findDeviceIdByUsn().
    */
    this.deviceIdByUsn = new Map();

    /*
      pendingUsnInserts is the actual queue.

      pendingUsnInsertKeys is only for de-duplicating queue entries while they
      are waiting to be written.
    */
    this.pendingUsnInserts = [];
    this.pendingUsnInsertKeys = new Set();
    this.processingPromise = null;
  }

  load() {
    this.deviceIdByUsn.clear();

    for (const row of this.persistedDeviceStore.listDeviceUsns()) {
      this.deviceIdByUsn.set(row.usn, row.deviceId);
    }
  }

  findDeviceIdByUsn(usn) {
    return this.deviceIdByUsn.get(usn) ?? null;
  }

  learnUsnsForPersistedDevice({ persistedDeviceId, usns }) {
    for (const usn of usns) {
      const knownDeviceId = this.findDeviceIdByUsn(usn);

      if (knownDeviceId === persistedDeviceId) {
        continue;
      }

      if (knownDeviceId && knownDeviceId !== persistedDeviceId) {
        this.emit("error", new Error(
          `USN already belongs to another persisted device: ${usn}`
        ));
        continue;
      }

      this.deviceIdByUsn.set(usn, persistedDeviceId);
      this.enqueueUsnInsert({ persistedDeviceId, usn });
    }
  }

  enqueueUsnInsert({ persistedDeviceId, usn }) {
    const key = this.toPendingUsnInsertKey({ persistedDeviceId, usn });

    if (this.pendingUsnInsertKeys.has(key)) {
      return;
    }

    this.pendingUsnInsertKeys.add(key);
    this.pendingUsnInserts.push({
      key,
      persistedDeviceId,
      usn
    });

    this.processQueue();
  }

  async processQueue() {
    if (this.processingPromise) {
      return this.processingPromise;
    }

    const processingPromise = this.doProcessQueue();
    this.processingPromise = processingPromise;

    try {
      await processingPromise;
    } finally {
      if (this.processingPromise === processingPromise) {
        this.processingPromise = null;
      }
    }
  }

  async doProcessQueue() {
    while (this.pendingUsnInserts.length > 0) {
      const item = this.pendingUsnInserts.shift();

      try {
        this.persistedDeviceStore.addDeviceUsn({
          deviceId: item.persistedDeviceId,
          usn: item.usn
        });
      } catch (error) {
        this.emit("error", error);
      } finally {
        this.pendingUsnInsertKeys.delete(item.key);
      }
    }
  }

  toPendingUsnInsertKey({ persistedDeviceId, usn }) {
    return `${persistedDeviceId}|${usn}`;
  }
}
