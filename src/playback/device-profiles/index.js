import { DeviceProfileService } from "./device-profile-service.js";
import { InMemoryDeviceProfileStore } from "./in-memory-device-profile-store.js";

export function createDeviceProfilesModule(options = {}) {
  const store = options.store ?? new InMemoryDeviceProfileStore();
  const service = new DeviceProfileService({
    store,
    controlStrategies: options.controlStrategies,
    deliveryStrategies: options.deliveryStrategies,
    resolveDeviceIdentifier: options.resolveDeviceIdentifier
  });

  return {
    listProfiles: service.listProfiles.bind(service),
    getProfileForDevice: service.getProfileForDevice.bind(service),
    saveProfileForDevice: service.saveProfileForDevice.bind(service),
    deleteProfileForDevice: service.deleteProfileForDevice.bind(service),
    getProfileByDeviceKey: service.getProfileByDeviceKey.bind(service),
    getSavedProfileByDeviceKey:
      service.getSavedProfileByDeviceKey.bind(service),
    saveProfileByDeviceKey: service.saveProfileByDeviceKey.bind(service),
    deleteProfileByDeviceKey: service.deleteProfileByDeviceKey.bind(service)
  };
}
