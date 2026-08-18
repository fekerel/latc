import { createControlStrategyRegistry } from "./control/index.js";
import { createDeliveryStrategyRegistry } from "./delivery/index.js";
import { createDeviceProfilesModule } from "./device-profiles/index.js";

export function createPlaybackModule(options = {}) {
  const controlStrategies = createControlStrategyRegistry(options.control);
  const deliveryStrategies = createDeliveryStrategyRegistry(options.delivery);
  const deviceProfiles = createDeviceProfilesModule({
    ...options.deviceProfiles,
    controlStrategies,
    deliveryStrategies
  });

  return {
    deviceProfiles
  };
}
