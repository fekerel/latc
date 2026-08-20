import { AppError } from "./app-error.js";

export class DeviceNotFoundError extends AppError {
  constructor() {
    super("Device not found", 404);
  }
}