import { ErrorCode } from '../errors/error-codes';

export interface ErrorResponse {
  success: false;
  code: ErrorCode;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
}
