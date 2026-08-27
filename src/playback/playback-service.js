import { BadRequestError } from "../common/errors/bad-request-error.js";

export class PlaybackService {
  constructor({
    deviceProfileService,
    controlStrategyRegistry,
    deliveryStrategyRegistry,
    sessionStore,
    getPublicBaseUrl
  }) {
    this.deviceProfileService = deviceProfileService;
    this.controlStrategyRegistry = controlStrategyRegistry;
    this.deliveryStrategyRegistry = deliveryStrategyRegistry;
    this.sessionStore = sessionStore;
    this.getPublicBaseUrl = getPublicBaseUrl;
  }

  async createSession({ deviceRegistryId, sourceUrl, subtitle }) {
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
        subtitle: createSubtitleSource(subtitle)
      },
      control: profile.control,
      delivery: profile.delivery,
      controlStrategy,
      deliveryStrategy
    });
    const streamUrl = this.createStreamUrl(session.id);
    const subtitleUrl = session.source.subtitle
      ? this.createSubtitleUrl(session.id)
      : undefined;

    await session.start({
      streamUrl,
      subtitleUrl
    });

    return {
      session,
      streamUrl
    };
  }

  async handleRequest(sessionId, { resourceKind = "video", request, response }) {
    const session = this.sessionStore.getSession(sessionId);

    await session.deliveryStrategy.handleRequest({
      session,
      resourceKind,
      request,
      response
    });  
  }

  createStreamUrl(sessionId) {
    return `${this.getPublicBaseUrl()}/playback/files/${sessionId}/video`;
  }

  createSubtitleUrl(sessionId) {
    return `${this.getPublicBaseUrl()}/playback/files/${sessionId}/subtitle`;
  }
}

function createSubtitleSource(subtitle) {
  if (!subtitle?.url) {
    return undefined;
  }

  return {
    url: subtitle.url,
    language: subtitle.lang
  };
}
