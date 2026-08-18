import { DiscoveryCoordinator } from "./discovery-coordinator.js";
import { DiscoveryManager } from "./discovery-manager.js";
import { DiscoveryWebSocketHandler } from "./discovery-websocket-handler.js";
import { DeviceRegistry } from "./device-registry.js";

export function createDiscoveryModule(options = {}) {
  const manager = new DiscoveryManager({
    searchInterval: options.searchInterval ?? 5000
  });
  const registry = new DeviceRegistry();
  const coordinator = new DiscoveryCoordinator(manager, registry, {
    stopGraceMs: options.stopGraceMs ?? 5000
  });
  const websocketHandler = new DiscoveryWebSocketHandler({
    subscribe: coordinator.subscribe.bind(coordinator)
  });

  return {
    handleWebSocket: websocketHandler.handle.bind(websocketHandler),
    subscribe: coordinator.subscribe.bind(coordinator),
    acquireDiscovery: coordinator.acquireDiscovery.bind(coordinator),
    resolveDeviceIdentifier:
      coordinator.resolveDeviceIdentifier.bind(coordinator),
    listDevices: coordinator.listDevices.bind(coordinator),
    getDeviceById: registry.getDeviceById.bind(registry),
    onError: (listener) => coordinator.on("error", listener)
  };
}
