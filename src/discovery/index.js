import { DiscoveryCoordinator } from "./discovery-coordinator.js";
import { DiscoveryManager } from "./discovery-manager.js";
import { DiscoveryWebSocketHandler } from "./discovery-websocket-handler.js";
import { DeviceRegistry } from "./device-registry.js";
import { PersistedDeviceStore } from "./persisted-device-store.js";
import { PersistedIdentityIndex } from "./persisted-identity-index.js";

export function createDiscoveryModule(options = {}) {
  let persistedDeviceStore = null;
  let persistedIdentityIndex = options.persistedIdentityIndex ?? null;

  if (options.db) {
    persistedDeviceStore = new PersistedDeviceStore(options.db);
    persistedDeviceStore.migrate();

    persistedIdentityIndex = new PersistedIdentityIndex({
      persistedDeviceStore
    });
    persistedIdentityIndex.load();
  }

  const manager = new DiscoveryManager({
    searchInterval: options.searchInterval ?? 5000
  });
  const registry = new DeviceRegistry({
    seenRecentlyMs: options.seenRecentlyMs ?? 30000,
    probeTimeoutMs: options.probeTimeoutMs ?? 1500,
    persistedIdentityIndex
  });
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: options.stopGraceMs ?? 5000
  });

  persistedIdentityIndex?.on("error", (error) => {
    coordinator.emit("error", error);
  });

  const websocketHandler = new DiscoveryWebSocketHandler({
    subscribe: coordinator.subscribe.bind(coordinator)
  });

  return {
    handleWebSocket: websocketHandler.handle.bind(websocketHandler),
    listDevices: coordinator.listDevices.bind(coordinator),
    listPersistedDevices: () => persistedDeviceStore?.listDevices() ?? [],
    onError: (listener) => coordinator.on("error", listener)
  };
}
