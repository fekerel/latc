import { DeviceProfileService } from "./device-profile-service.js";
import { InMemoryDeviceProfileStore } from "./in-memory-device-profile-store.js";

export function createDeviceProfilesModule(options = {}) {
  const store = options.store ?? new InMemoryDeviceProfileStore();
  const service = new DeviceProfileService({
    store,
    controlStrategies: options.controlStrategies,
    deliveryStrategies: options.deliveryStrategies
  });

  return {
    listProfiles: service.listProfiles.bind(service),
    getProfile: service.getProfile.bind(service),
    saveProfile: service.saveProfile.bind(service),
    deleteProfile: service.deleteProfile.bind(service)
  };
}
