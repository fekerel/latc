import { AppError } from "../common/errors/app-error.js";
import { BadRequestError } from "../common/errors/bad-request-error.js";

const EXTRA_ARG_NAMES = ["filename", "videoSize", "videoHash"];

export class SubtitleDiscoveryService {
  constructor(options = {}) {
    this.fetch = options.fetch ?? fetch;
  }

  async discover(input = {}) {
    const requestUrl = createSubtitleRequestUrl(input);
    const response = await this.fetch(requestUrl, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok && response.status >= 400) {
      throw new AppError("Subtitle discovery failed", 502, {
        status: response.status,
        requestUrl
      });
    }

    const payload = await response.json();

    return groupSubtitlesByLanguage(payload.subtitles);
  }
}

export function createSubtitleRequestUrl(input = {}) {
  const transportUrl = normalizeTransportUrl(input.subtitleAddonTransportUrl);
  const type = normalizeRequiredPathPart(input.type, "type");
  const videoId = normalizeRequiredPathPart(input.videoId, "videoId");
  const extraArgs = createExtraArgs(input);
  const basePath = `${transportUrl}/subtitles/${encodeURIComponent(type)}/${encodeURIComponent(videoId)}`;

  if (!extraArgs) {
    return `${basePath}.json`;
  }

  return `${basePath}/${extraArgs}.json`;
}

function normalizeTransportUrl(transportUrl) {
  if (!transportUrl) {
    throw new BadRequestError("subtitleAddonTransportUrl is required");
  }

  let url;

  try {
    url = new URL(transportUrl);
  } catch {
    throw new BadRequestError("subtitleAddonTransportUrl must be a valid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new BadRequestError("subtitleAddonTransportUrl must use http or https");
  }

  if (url.pathname.endsWith("/manifest.json")) {
    url.pathname = url.pathname.slice(0, -"/manifest.json".length) || "/";
    url.search = "";
    url.hash = "";
  }

  return url.href.replace(/\/+$/, "");
}

function normalizeRequiredPathPart(value, name) {
  if (!value) {
    throw new BadRequestError(`${name} is required`);
  }

  return String(value);
}

function createExtraArgs(input) {
  return EXTRA_ARG_NAMES.map((name) => createExtraArg(name, input[name]))
    .filter(Boolean)
    .join("&");
}

function createExtraArg(name, value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return `${name}=${encodeURIComponent(String(value))}`;
}

function groupSubtitlesByLanguage(subtitles = []) {
  if (!Array.isArray(subtitles)) {
    return {};
  }

  const subtitlesByLanguage = {};

  for (const subtitle of subtitles) {
    const language = subtitle.lang || "und";

    subtitlesByLanguage[language] ??= [];
    subtitlesByLanguage[language].push(subtitle);
  }

  for (const language of Object.keys(subtitlesByLanguage)) {
    subtitlesByLanguage[language].sort(compareSubtitleIds);
  }

  return subtitlesByLanguage;
}

function compareSubtitleIds(left, right) {
  return String(left.id ?? "").localeCompare(String(right.id ?? ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}
