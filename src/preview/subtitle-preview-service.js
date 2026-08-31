export class SubtitlePreviewService {
  constructor({ fetch: fetchImplementation = globalThis.fetch } = {}) {
    if (typeof fetchImplementation !== "function") {
      throw new Error("Subtitle preview service fetch implementation is required");
    }

    this.fetch = fetchImplementation;
  }

  async prepareSubtitle({ url }) {
    if (!url) {
      throw new Error("Subtitle url is required");
    }

    const response = await this.fetch(url, {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`Subtitle request failed with status ${response.status}`);
    }

    return toWebVtt(await response.text());
  }
}

function toWebVtt(text) {
  const normalizedText = String(text).replace(/\r\n?/g, "\n").trimStart();

  if (normalizedText.startsWith("WEBVTT")) {
    return normalizedText;
  }

  return [
    "WEBVTT",
    "",
    normalizedText.replace(
      /(\d{1,3}:\d{2}:\d{2}),(\d{3})(\s*-->\s*)(\d{1,3}:\d{2}:\d{2}),(\d{3})/g,
      "$1.$2$3$4.$5"
    )
  ].join("\n");
}
