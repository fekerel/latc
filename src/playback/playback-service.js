import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestError } from "../common/errors/bad-request-error.js";
import { NotFoundError } from "../common/errors/not-found-error.js";

export class PlaybackService {
  constructor({
    deviceProfileService,
    controlStrategyRegistry,
    deliveryStrategyRegistry,
    sessionStore,
    getPublicBaseUrl,
    fetch: fetchDependency
  }) {
    this.deviceProfileService = deviceProfileService;
    this.controlStrategyRegistry = controlStrategyRegistry;
    this.deliveryStrategyRegistry = deliveryStrategyRegistry;
    this.sessionStore = sessionStore;
    this.getPublicBaseUrl = getPublicBaseUrl;
    this.fetch = fetchDependency ?? fetch;
  }

  async createSession({ deviceRegistryId, sourceUrl, subtitleUrl, subtitles }) {
    if (!deviceRegistryId) {
      throw new BadRequestError("deviceRegistryId is required");
    }

    if (!sourceUrl) {
      throw new BadRequestError("sourceUrl is required");
    }

    const profile = await this.deviceProfileService.getProfileForDevice(deviceRegistryId);
      
    const controlStrategy = this.controlStrategyRegistry.create(
      profile.control.kind,
      profile.control.config
    );
    const deliveryStrategy = this.deliveryStrategyRegistry.create(
      profile.delivery.kind,
      profile.delivery.config
    );
    const session = this.sessionStore.createSession({
      deviceRegistryId,
      deviceKey: profile.deviceKey,
      source: {
        url: sourceUrl,
        subtitles: createSubtitleSources({ subtitleUrl, subtitles })
      },
      control: profile.control,
      delivery: profile.delivery,
      controlStrategy,
      deliveryStrategy
    });
    const streamUrl = this.createStreamUrl(session.id);

    attachSubtitleDeliveryUrls(session, (subtitleId) =>
      this.createSubtitleUrl(session.id, subtitleId)
    );

    await session.start({
      streamUrl
    });

    return {
      session,
      streamUrl
    };
  }

  async handleRequest(sessionId, { request, response }) {
    const session = this.sessionStore.getSession(sessionId);

    await session.deliveryStrategy.handleRequest({
      session,
      request,
      response
    });  
  }

  async handleSubtitleRequest(sessionId, subtitleId, { request, response }) {
    logSubtitleEvent("request_start", {
      sessionId,
      subtitleId,
      method: request.method,
      url: request.originalUrl ?? request.url,
      userAgent: request.headers?.["user-agent"]
    });

    const session = this.sessionStore.getSession(sessionId);
    const subtitle = findSubtitle(session, subtitleId);
    logSubtitleEvent("subtitle_found", {
      sessionId,
      subtitleId,
      upstreamUrl: subtitle.url,
      format: subtitle.format
    });

    const upstream = await this.fetch(subtitle.url, {
      method: request.method === "HEAD" ? "GET" : request.method
    });
    logSubtitleEvent("upstream_response", {
      sessionId,
      subtitleId,
      status: upstream.status,
      contentType: upstream.headers.get("content-type"),
      contentLength: upstream.headers.get("content-length")
    });

    response.status(upstream.status);
    response.setHeader("content-type", "application/x-subrip; charset=utf-8");
    setHeader(response, "content-length", upstream.headers.get("content-length"));
    response.setHeader("connection", "close");

    if (request.method === "HEAD" || !upstream.body) {
      await upstream.body?.cancel?.();
      response.end();
      logSubtitleEvent("response_end", {
        sessionId,
        subtitleId,
        method: request.method,
        bodySent: false
      });
      return;
    }

    try {
      await pipeline(Readable.fromWeb(upstream.body), response);
      logSubtitleEvent("pipeline_complete", {
        sessionId,
        subtitleId,
        responseDestroyed: response.destroyed,
        responseWritableEnded: response.writableEnded
      });
    } catch (error) {
      logSubtitleError("pipeline_error", error, {
        sessionId,
        subtitleId,
        responseDestroyed: response.destroyed,
        responseWritableEnded: response.writableEnded
      });

      if (!response.headersSent) {
        throw error;
      }
    }
  }

  createStreamUrl(sessionId) {
    return `${this.getPublicBaseUrl()}/playback/files/${sessionId}/video.mp4`;
  }

  createSubtitleUrl(sessionId, subtitleId) {
    const subtitleFileName =
      subtitleId === "default" ? "video.srt" : `video.${subtitleId}.srt`;

    return `${this.getPublicBaseUrl()}/playback/files/${sessionId}/${subtitleFileName}`;
  }
}

function createSubtitleSources({ subtitleUrl, subtitles }) {
  if (Array.isArray(subtitles) && subtitles.length > 0) {
    return subtitles.map((subtitle, index) =>
      normalizeSubtitleSource(subtitle, index)
    );
  }

  if (!subtitleUrl) {
    return [];
  }

  return [
    {
      id: "default",
      url: subtitleUrl,
      format: "srt"
    }
  ];
}

function normalizeSubtitleSource(subtitle, index) {
  if (!subtitle?.url) {
    throw new BadRequestError("subtitle url is required");
  }

  return {
    id: normalizeSubtitleId(subtitle.id ?? `subtitle-${index + 1}`),
    url: subtitle.url,
    format: subtitle.format ?? "srt",
    language: subtitle.language,
    label: subtitle.label,
    contentType: subtitle.contentType
  };
}

function normalizeSubtitleId(subtitleId) {
  const normalizedSubtitleId = String(subtitleId).trim();

  if (!/^[a-zA-Z0-9_-]+$/.test(normalizedSubtitleId)) {
    throw new BadRequestError(
      "subtitle id must contain only letters, numbers, underscore, or dash"
    );
  }

  return normalizedSubtitleId;
}

function attachSubtitleDeliveryUrls(session, createSubtitleUrl) {
  if (!session.source.subtitles?.length) {
    return;
  }

  session.source = {
    ...session.source,
    subtitles: session.source.subtitles.map((subtitle) => ({
      ...subtitle,
      deliveryUrl: createSubtitleUrl(subtitle.id)
    }))
  };
}

function findSubtitle(session, subtitleId) {
  const subtitle = session.source.subtitles?.find(
    (candidate) => candidate.id === subtitleId
  );

  if (!subtitle) {
    throw new NotFoundError("Subtitle not found");
  }

  return subtitle;
}

function setHeader(response, name, value) {
  if (value) {
    response.setHeader(name, value);
  }
}

function logSubtitleEvent(event, details = {}) {
  console.info("[playback-subtitles] event", {
    event,
    ...details
  });
}

function logSubtitleError(event, error, details = {}) {
  console.error("[playback-subtitles] error", {
    event,
    name: error.name,
    code: error.code,
    message: error.message,
    ...details
  });
}
