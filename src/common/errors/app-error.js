export class AppError extends Error {
  constructor(message = this.constructor.name, statusCode = 500, details = {}) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}