import { AppError } from "./app-error.js";

export class NotFoundError extends AppError {
  constructor(message, details = {}) {
    super(message, 404, details);
  }
}