import { createDiscoveryModule } from "./discovery/index.js";

export function createApp(config = {}) {
  const discovery = createDiscoveryModule(config.discovery);

  return {
    discovery
  };
}
