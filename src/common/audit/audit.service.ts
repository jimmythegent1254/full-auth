import { Injectable } from '@nestjs/common';
import { logger } from '../logger/logger';

@Injectable()
export class AuditService {
  logSignupSuccess(data: { userId: number; email: string; ip?: string }) {
    logger.info({
      event: 'AUTH_SIGNUP_SUCCESS',
      userId: data.userId,
      email: data.email,
      ip: data.ip,
      timestamp: new Date().toISOString(),
    });
  }

  logSignupFailure(data: { email: string; reason: string; ip?: string }) {
    logger.warn({
      event: 'AUTH_SIGNUP_FAILURE',
      email: data.email,
      reason: data.reason,
      ip: data.ip,
      timestamp: new Date().toISOString(),
    });
  }
}
