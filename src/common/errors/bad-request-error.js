import { AppError } from "./app-error.js";

export class BadRequestError extends AppError {
  constructor(message, statusCode = 400, details = {}) {
    super(message, statusCode, details);
  }
}