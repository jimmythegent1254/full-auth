import { ErrorCode } from './error-codes';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message?: string,
    public readonly meta?: Record<string, any>,
  ) {
    super(message || code);
  }
}
