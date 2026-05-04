import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app.error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { logger } from '../../common/logger/logger';
import { DRIZZLE } from '../../database/database.module';
import { normalizeEmail, normalizeString } from '../../utils/string/normalize';
import { AccountRepository } from '../repositories/account.repository';
import { EmailService } from '../email.service';
import { toPublicUser } from '../mappers/user.mapper';
import { SecurityService } from './security.service';
import { SessionService } from './session.service';
import { TokenRepository } from '../repositories/token.repository';
import { TokenService } from './token.service';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class AuthDomainService {
  constructor(
    @Inject(DRIZZLE)
    private readonly userRepository: UserRepository,
    private readonly accountRepository: AccountRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly securityService: SecurityService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly emailService: EmailService,
  ) {}

  async signin(email: string, password: string, meta?: { ip?: string; userAgent?: string }) {
    const normalizedEmail = normalizeEmail(email);

    const account = await this.accountRepository.findByProviderAndId('local', normalizedEmail);

    if (!account || !account.passwordHash) {
      await this.securityService.fakeDelay();
      logger.warn({
        type: 'SIGNIN_FAILED',
        reason: 'ACCOUNT_NOT_FOUND',
        email: normalizedEmail,
        ip: meta?.ip,
      });
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    const isValid = await this.securityService.verifyPassword(account.passwordHash, password);

    if (!isValid) {
      await this.securityService.fakeDelay();
      logger.warn({
        type: 'SIGNIN_FAILED',
        reason: 'INVALID_PASSWORD',
        email: normalizedEmail,
        ip: meta?.ip,
      });
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    const user = await this.userRepository.findById(account.userId);
    if (!user) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 500);
    }

    const session = await this.sessionService.createSession(user.id, meta);

    logger.info({
      type: 'SIGNIN_SUCCESS',
      userId: user.id,
      email: user.email,
      ip: meta?.ip,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      sessionId: session.id,
    };
  }

  async signup(name: string, email: string, password: string, ip?: string) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeString(name);

    const existingUser = await this.userRepository.findByEmail(normalizedEmail);

    if (existingUser) {
      const existingLocalAccount = await this.accountRepository.findByUserIdAndProvider(existingUser.id, 'local');
      if (existingLocalAccount) {
        throw new AppError(ERROR_CODES.ACCOUNT_EXISTS, 400);
      }

      // Add local login
      const passwordHash = await this.securityService.hashPassword(password);
      await this.accountRepository.create({
        userId: existingUser.id,
        provider: 'local',
        providerId: normalizedEmail,
        passwordHash,
      });

      const token = this.tokenService.generateVerificationToken();
      const expiresAt = this.tokenService.getVerificationTokenExpiry();
      await this.tokenRepository.createVerification({
        userId: existingUser.id,
        token,
        expiresAt,
        used: false,
      });

      await this.emailService.sendVerificationEmail(existingUser.email, token);

      return toPublicUser(existingUser);
    }

    const user = await this.userRepository.create({
      name: normalizedName,
      email: normalizedEmail,
      isVerified: false,
    });

    const passwordHash = await this.securityService.hashPassword(password);
    await this.accountRepository.create({
      userId: user.id,
      provider: 'local',
      providerId: normalizedEmail,
      passwordHash,
    });

    const token = this.tokenService.generateVerificationToken();
    const expiresAt = this.tokenService.getVerificationTokenExpiry();
    await this.tokenRepository.createVerification({
      userId: user.id,
      token,
      expiresAt,
      used: false,
    });

    await this.emailService.sendVerificationEmail(user.email, token);

    return toPublicUser(user);
  }

  async requestPasswordReset(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      logger.warn({
        type: 'PASSWORD_RESET_REQUEST_FAILED',
        reason: 'USER_NOT_FOUND',
        email,
      });
      return { success: true };
    }

    const token = this.tokenService.generatePasswordResetToken();
    const tokenHash = this.tokenService.hashToken(token);
    const expiresAt = this.tokenService.getPasswordResetTokenExpiry();

    await this.tokenRepository.createPasswordReset({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.emailService.sendPasswordResetEmail(user.email, token);

    logger.info({
      type: 'PASSWORD_RESET_REQUEST_SENT',
      userId: user.id,
      email: user.email,
    });

    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.tokenService.hashToken(token);
    const record = await this.tokenRepository.findPasswordResetByHash(tokenHash);

    if (!record) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'INVALID_TOKEN',
      });
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 400);
    }

    if (record.used) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'TOKEN_ALREADY_USED',
        userId: record.userId,
      });
      throw new AppError(ERROR_CODES.TOKEN_USED, 400);
    }

    if (record.expiresAt < new Date()) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'TOKEN_EXPIRED',
        userId: record.userId,
      });
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 400);
    }

    const hashedPassword = await this.securityService.hashPassword(newPassword);
    await this.accountRepository.updatePasswordHash(record.userId, 'local', hashedPassword);
    await this.tokenRepository.markPasswordResetUsed(record.id);
    await this.sessionService.revokeAllSessions(record.userId);

    logger.info({
      type: 'PASSWORD_RESET_SUCCESS',
      userId: record.userId,
    });

    return { success: true };
  }

  async verifyEmail(token: string) {
    const record = await this.tokenRepository.findVerificationByToken(token);

    if (!record || record.used || record.expiresAt < new Date()) {
      logger.warn({
        type: 'EMAIL_VERIFICATION_FAILED',
        reason: 'INVALID_TOKEN',
      });
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 400);
    }

    await this.tokenRepository.deleteVerificationByToken(token);
    await this.userRepository.updateVerified(record.userId, true);

    logger.info({
      type: 'EMAIL_VERIFICATION_SUCCESS',
      userId: record.userId,
    });

    return { success: true };
  }

  async oauthLogin(profile: { githubId: string; email?: string; name: string }) {
    let account = await this.accountRepository.findByProviderAndId('github', profile.githubId);
    let user: any;

    if (account) {
      user = await this.userRepository.findById(account.userId);
    } else {
      if (profile.email) {
        user = await this.userRepository.findByEmail(profile.email);
      }
      if (!user) {
        user = await this.userRepository.create({
          email: profile.email ?? `github_${profile.githubId}@placeholder.com`,
          name: profile.name,
          isVerified: true,
        });
      }
      await this.accountRepository.create({
        userId: user.id,
        provider: 'github',
        providerId: profile.githubId,
      });
    }

    const session = await this.sessionService.createSession(user.id);

    return {
      user,
      sessionId: session.id,
    };
  }

  async logout(sessionId: string) {
    await this.sessionService.revokeSession(sessionId);
    logger.info({
      type: 'LOGOUT',
      sessionId,
    });
    return { success: true };
  }

  async logoutAll(userId: number) {
    await this.sessionService.revokeAllSessions(userId);
    logger.info({
      type: 'LOGOUT_ALL',
      userId,
    });
    return { success: true };
  }

  async getUserSessions(userId: number) {
    return this.sessionService.getActiveSessions(userId);
  }

  async revokeSession(sessionId: string, userId: number) {
    const isValid = await this.sessionService.validateSession(sessionId, userId);
    if (!isValid) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 401);
    }
    await this.sessionService.revokeSession(sessionId);
    return { success: true };
  }
}