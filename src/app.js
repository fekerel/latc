import { createDatabase } from "./database/index.js";
import { createDiscoveryModule } from "./discovery/index.js";

export function createApp(config = {}) {
  const db = createDatabase(config.database);
  const discovery = createDiscoveryModule({
    ...config.discovery,
    db
  });

  return {
    db,
    discovery
  };
}
