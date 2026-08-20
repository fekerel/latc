export class DeviceProfileService {
  constructor({
    store,
    controlStrategies,
    deliveryStrategies,
    resolveDeviceIdentifier
  }) {
    this.store = store;
    this.controlStrategies = controlStrategies;
    this.deliveryStrategies = deliveryStrategies;
    this.resolveDeviceIdentifier = resolveDeviceIdentifier;
  }

  listProfiles() {
    return this.store.listProfiles();
  }

  async getProfileForDevice(deviceRegistryId) {
    const deviceKey = await this.resolveDeviceKey(deviceRegistryId);

    return this.getProfileByDeviceKey(deviceKey);
  }

  async saveProfileForDevice(deviceRegistryId, profile) {
    const deviceKey = await this.resolveDeviceKey(deviceRegistryId);

    return this.saveProfileByDeviceKey({
        ...profile,
        deviceKey
      });
  }

  async deleteProfileForDevice(deviceRegistryId) {
    const deviceKey = await this.resolveDeviceKey(deviceRegistryId);
    
    return this.deleteProfileByDeviceKey(deviceKey);
  }

  getProfileByDeviceKey(deviceKey) {
    return (
      this.getSavedProfileByDeviceKey(deviceKey) ??
      this.createDefaultProfile(deviceKey)
    );
  }

  getSavedProfileByDeviceKey(deviceKey) {
    return this.store.getProfile(deviceKey);
  }

  saveProfileByDeviceKey(profile) {
    this.validateProfile(profile);
    return this.store.saveProfile(profile);
  }

  deleteProfileByDeviceKey(deviceKey) {
    return this.store.deleteProfile(deviceKey);
  }

  async resolveDeviceKey(deviceRegistryId) {
    if (!this.resolveDeviceIdentifier) {
      throw new TypeError("resolveDeviceIdentifier is required");
    }

    const identifier = await this.resolveDeviceIdentifier(deviceRegistryId);

    return identifier;
  }

  validateProfile(profile) {
    if (!profile || typeof profile !== "object") {
      throw new TypeError("profile is required");
    }

    if (!profile.deviceKey) {
      throw new TypeError("profile.deviceKey is required");
    }

    this.validateStrategyConfig({
      name: "control",
      config: profile.control,
      registry: this.controlStrategies
    });
    this.validateStrategyConfig({
      name: "delivery",
      config: profile.delivery,
      registry: this.deliveryStrategies
    });
  }

  validateStrategyConfig({ name, config, registry }) {
    if (!config || typeof config !== "object") {
      throw new TypeError(`profile.${name} is required`);
    }

    if (!config.kind) {
      throw new TypeError(`profile.${name}.kind is required`);
    }

    if (registry && !registry.has(config.kind)) {
      throw new RangeError(`unknown_${name}_strategy`);
    }
  }

  createDefaultProfile(deviceKey) {
    const control = this.controlStrategies.getDefault();
    const delivery = this.deliveryStrategies.getDefault();

    return {
      deviceKey,
      control: {
        kind: control.kind,
        config: cloneConfig(control.defaultConfig ?? {})
      },
      delivery: {
        kind: delivery.kind,
        config: cloneConfig(delivery.defaultConfig ?? {})
      }
    };
  }
}

function cloneConfig(config) {
  return structuredClone(config);
}
