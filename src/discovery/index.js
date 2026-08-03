import { DiscoveryCoordinator } from "./discovery-coordinator.js";
import { DiscoveryManager } from "./discovery-manager.js";
import { DeviceRegistry } from "./device-registry.js";

export function createDiscoveryModule(options = {}) {
  const manager = new DiscoveryManager({
    searchInterval: options.searchInterval ?? 5000
  });
  const registry = new DeviceRegistry({
    seenRecentlyMs: options.seenRecentlyMs ?? 30000
  });
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: options.stopGraceMs ?? 5000
  });

  return {
    subscribe: coordinator.subscribe.bind(coordinator),
    listDevices: coordinator.listDevices.bind(coordinator),
    onError: (listener) => coordinator.on("error", listener)
  };
}
