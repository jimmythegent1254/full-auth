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

  logSigninSuccess(data: { userId: number; email: string; ip?: string }) {
    logger.info({
      event: 'AUTH_SIGNIN_SUCCESS',
      userId: data.userId,
      email: data.email,
      ip: data.ip,
      timestamp: new Date().toISOString(),
    });
  }

  logSigninFailure(data: { email: string; reason: string; ip?: string }) {
    logger.warn({
      event: 'AUTH_SIGNIN_FAILURE',
      email: data.email,
      reason: data.reason,
      ip: data.ip,
      timestamp: new Date().toISOString(),
    });
  }

  logSignout(data: {
    sessionId?: string;
    userId?: number;
    allSessions?: boolean;
  }) {
    logger.info({
      event: 'AUTH_SIGNOUT',
      sessionId: data.sessionId,
      userId: data.userId,
      allSessions: data.allSessions ?? false,
      timestamp: new Date().toISOString(),
    });
  }

  logPasswordResetRequest(data: {
    email: string;
    success: boolean;
    reason?: string;
    userId?: number;
  }) {
    const level = data.success ? 'info' : 'warn';
    logger[level]({
      event: 'PASSWORD_RESET_REQUEST',
      email: data.email,
      success: data.success,
      reason: data.reason,
      userId: data.userId,
      timestamp: new Date().toISOString(),
    });
  }

  logPasswordReset(data: {
    userId?: number;
    success: boolean;
    reason?: string;
  }) {
    const level = data.success ? 'info' : 'warn';
    logger[level]({
      event: 'PASSWORD_RESET',
      userId: data.userId,
      success: data.success,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });
  }

  logEmailVerification(data: {
    userId?: number;
    success: boolean;
    reason?: string;
  }) {
    const level = data.success ? 'info' : 'warn';
    logger[level]({
      event: 'EMAIL_VERIFICATION',
      userId: data.userId,
      success: data.success,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });
  }
}
