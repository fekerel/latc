import { AppError } from "./app-error.js";

export class PlaybackStartError extends AppError {
  constructor(message, statusCode = 502, details = {}) {
    super(message, statusCode, details);
  }
}