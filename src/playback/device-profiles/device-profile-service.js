export class DeviceProfileService {
  constructor({ store, controlStrategies, deliveryStrategies }) {
    this.store = store;
    this.controlStrategies = controlStrategies;
    this.deliveryStrategies = deliveryStrategies;
  }

  listProfiles() {
    return this.store.listProfiles();
  }

  getProfile(deviceKey) {
    return this.store.getProfile(deviceKey);
  }

  saveProfile(profile) {
    this.validateProfile(profile);
    return this.store.saveProfile(profile);
  }

  deleteProfile(deviceKey) {
    return this.store.deleteProfile(deviceKey);
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
}
