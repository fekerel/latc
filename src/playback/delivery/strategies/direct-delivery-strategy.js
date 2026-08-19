export class DirectDeliveryStrategy {
  static kind = "direct";
  static label = "Direct URL";
  static defaultConfig = {};

  constructor(config = {}) {
    this.config = config;
  }

  async prepare({ sourceUrl }) {
    return {
      url: sourceUrl
    };
  }
}
