export class InMemoryDeviceProfileStore {
  constructor() {
    this.profilesByDeviceKey = new Map();
  }

  listProfiles() {
    return [...this.profilesByDeviceKey.values()];
  }

  getProfile(deviceKey) {
    return this.profilesByDeviceKey.get(deviceKey);
  }

  saveProfile(profile) {
    this.profilesByDeviceKey.set(profile.deviceKey, profile);
    return profile;
  }

  deleteProfile(deviceKey) {
    return this.profilesByDeviceKey.delete(deviceKey);
  }
}
