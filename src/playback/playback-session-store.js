import { randomUUID } from "node:crypto";
import { PlaybackSession } from "./playback-session.js";
import { NotFoundError } from "../common/errors/not-found-error.js";

export class PlaybackSessionStore {
  constructor() {
    this.sessionsById = new Map();
  }

  createSession(input) {
    const session = new PlaybackSession({
      ...input,
      id: input.id ?? randomUUID()
    });

    this.sessionsById.set(session.id, session);

    session.once("closed", () => {
      this.sessionsById.delete(session.id)
    });

    return session;
  }

  getSession(sessionId) {
    const session = this.sessionsById.get(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    return session;
  }

  deleteSession(sessionId) {
    return this.sessionsById.delete(sessionId);
  }
}
