export class DirectDeliveryStrategy {
  kind = "direct";
  label = "Direct URL";
  defaultConfig = {};

  async prepare({ sourceUrl }) {
    return {
      url: sourceUrl
    };
  }
}
