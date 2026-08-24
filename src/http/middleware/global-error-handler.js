import { AppError } from "../../common/errors/app-error.js";

export function globalErrorHandler(err, req, res, next) {
  res.status(err instanceof AppError ? err.statusCode : 500).json({
    success: false,
    message: err.message,
    stack: err.stack
  });
}
