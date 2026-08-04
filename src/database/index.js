import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function createDatabase(options = {}) {
  const databasePath = resolveDatabasePath(options.databasePath);

  mkdirSync(path.dirname(databasePath), {
    recursive: true
  });

  const db = new Database(databasePath, options.connectionOptions);

  configureDatabase(db, options);

  return db;
}

export function resolveDatabasePath(databasePath) {
  if (databasePath) {
    return path.resolve(databasePath);
  }

  return path.join(process.cwd(), "data", "latc.sqlite");
}

function configureDatabase(db, options = {}) {
  /*
    WAL keeps SQLite lightweight while making reads/writes behave better for a
    server process than the default rollback journal mode.
  */
  db.pragma("journal_mode = WAL");

  /*
    SQLite foreign keys are connection-local. If we want ON DELETE CASCADE to
    work, this must be enabled whenever the database connection is opened.
  */
  db.pragma("foreign_keys = ON");

  /*
    If another operation briefly holds the database lock, wait a little instead
    of failing immediately.
  */
  db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
}
