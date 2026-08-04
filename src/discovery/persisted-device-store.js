import { randomUUID } from "node:crypto";

export class PersistedDeviceStore {
  constructor(db) {
    this.db = db;

    this.statements = null;
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persisted_devices (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        media_player_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS persisted_device_usns (
        device_id TEXT NOT NULL,
        usn TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,

        FOREIGN KEY (device_id)
          REFERENCES persisted_devices(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_persisted_device_usns_device_id
      ON persisted_device_usns(device_id);
    `);

    this.prepareStatements();
  }

  prepareStatements() {
    this.statements = {
      listDevices: this.db.prepare(`
        SELECT
          id,
          display_name AS displayName,
          media_player_enabled AS mediaPlayerEnabled,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM persisted_devices
        ORDER BY display_name ASC
      `),

      insertDevice: this.db.prepare(`
        INSERT INTO persisted_devices (
          id,
          display_name,
          media_player_enabled,
          created_at,
          updated_at
        )
        VALUES (@id, @displayName, @mediaPlayerEnabled, @createdAt, @updatedAt)
      `),

      deleteDevice: this.db.prepare(`
        DELETE FROM persisted_devices
        WHERE id = ?
      `),

      listDeviceUsns: this.db.prepare(`
        SELECT
          device_id AS deviceId,
          usn
        FROM persisted_device_usns
      `),

      insertDeviceUsn: this.db.prepare(`
        INSERT INTO persisted_device_usns (
          device_id,
          usn,
          created_at
        )
        VALUES (@deviceId, @usn, @createdAt)
        ON CONFLICT(usn) DO NOTHING
      `)
    };
  }

  listDevices() {
    return this.statements.listDevices.all().map((device) => {
      return {
        ...device,
        mediaPlayerEnabled: Boolean(device.mediaPlayerEnabled)
      };
    });
  }

  createDevice(input) {
    const now = new Date().toISOString();

    const device = {
      id: input.id ?? randomUUID(),
      displayName: input.displayName,
      mediaPlayerEnabled: input.mediaPlayerEnabled ? 1 : 0,
      createdAt: now,
      updatedAt: now
    };

    this.statements.insertDevice.run(device);

    return {
      ...device,
      mediaPlayerEnabled: Boolean(device.mediaPlayerEnabled)
    };
  }

  deleteDevice(id) {
    return this.statements.deleteDevice.run(id).changes > 0;
  }

  listDeviceUsns() {
    return this.statements.listDeviceUsns.all();
  }

  addDeviceUsn({ deviceId, usn }) {
    return (
      this.statements.insertDeviceUsn.run({
        deviceId,
        usn,
        createdAt: new Date().toISOString()
      }).changes > 0
    );
  }
}
