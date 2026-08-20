import { AppError } from "./app-error.js";

export class UnsupportedDeviceError extends AppError {
  constructor() {
    super("Device does not support this operation", 422);
  }
}