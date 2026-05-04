import { Injectable } from '@nestjs/common';
import { generateSessionId } from '../../utils/crypto/session';
import { SESSION_EXPIRY } from '../constants';
import { SessionRepository } from '../repositories/session.repository';
const UAParser = require('ua-parser-js');

@Injectable()
export class SessionService {
  constructor(private readonly sessionRepository: SessionRepository) {}

  async createSession(
    userId: number,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<{ id: string }> {
    const sessionId = generateSessionId();

    const expiresAt = new Date(Date.now() + SESSION_EXPIRY);

    let userAgent = meta?.userAgent;
    if (meta?.userAgent) {
      const parser = new UAParser(meta.userAgent);
      const ua = parser.getResult();
      userAgent = `${ua.browser.name ?? 'Unknown'} on ${ua.os.name ?? 'Unknown'}`;
    }

    const session = await this.sessionRepository.create({
      id: sessionId,
      userId,
      expiresAt,
      ip: meta?.ip,
      userAgent,
    });

    return { id: session.id };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.revoke(sessionId);
  }

  async revokeAllSessions(userId: number): Promise<void> {
    await this.sessionRepository.revokeAll(userId);
  }

  async getActiveSessions(userId: number) {
    return this.sessionRepository.findActiveByUserId(userId);
  }

  async validateSession(sessionId: string, userId: number): Promise<boolean> {
    const session = await this.sessionRepository.findById(sessionId);
    return !!(session && session.userId === userId && !session.revokedAt && session.expiresAt > new Date());
  }
}