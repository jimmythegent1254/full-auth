import { Injectable } from '@nestjs/common';
import { AuthDomainService } from './services/auth-domain.service';

@Injectable()
export class AuthService {
  constructor(private readonly authDomainService: AuthDomainService) {}

  async signin(email: string, password: string, meta?: { ip?: string; userAgent?: string }) {
    return this.authDomainService.signin(email, password, meta);
  }

  async signup(name: string, email: string, password: string, ip?: string) {
    return this.authDomainService.signup(name, email, password, ip);
  }

  async logout(sessionId: string) {
    return this.authDomainService.logout(sessionId);
  }

  async logoutAll(userId: number) {
    return this.authDomainService.logoutAll(userId);
  }

  async getUserSessions(userId: number) {
    return this.authDomainService.getUserSessions(userId);
  }

  async revokeSession(sessionId: string, userId: number) {
    return this.authDomainService.revokeSession(sessionId, userId);
  }

  async requestPasswordReset(email: string) {
    return this.authDomainService.requestPasswordReset(email);
  }

  async resetPassword(token: string, newPassword: string) {
    return this.authDomainService.resetPassword(token, newPassword);
  }

  async verifyEmail(token: string) {
    return this.authDomainService.verifyEmail(token);
  }

  async oauthLogin(profile: { githubId: string; email?: string; name: string }) {
    return this.authDomainService.oauthLogin(profile);
  }
}