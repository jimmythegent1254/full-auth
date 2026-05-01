import type { ErrorCode } from './error-code';

export interface ErrorResponse {
  success: false;
  code: ErrorCode;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
}
