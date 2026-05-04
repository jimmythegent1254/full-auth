import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app.error';
import { ERROR_CODES } from '../common/errors/error-codes';
import { logger } from '../common/logger/logger';
import { hashPassword, verifyPassword } from '../utils/crypto/password';
import { generateResetToken, hashToken } from '../utils/crypto/reset-token';
import { generateSessionId } from '../utils/crypto/session';
import { generateVerificationToken } from '../utils/crypto/token';
import { normalizeEmail, normalizeString } from '../utils/string/normalize';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.service';
import { toPublicUser } from './mappers/user.mapper';
import { AccountRepository } from './repositories/account.repository';
import { SessionRepository } from './repositories/session.repository';
import { TokenRepository } from './repositories/token.repository';
import { UserRepository } from './repositories/user.repository';
const UAParser = require('ua-parser-js');

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly accountRepository: AccountRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly tokenRepository: TokenRepository,
  ) {}

  async signin(
    email: string,
    password: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const normalizedEmail = normalizeEmail(email);

    // Find LOCAL account (not user)
    const account = await this.accountRepository.findByProviderAndId('local', normalizedEmail);

    // Prevent user enumeration + fake delay
    if (!account || !account.passwordHash) {
      await this.fakePasswordDelay();

      logger.warn({
        type: 'SIGNIN_FAILED',
        reason: 'ACCOUNT_NOT_FOUND',
        email: normalizedEmail,
        ip: meta?.ip,
      });

      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // Verify password
    const isValid = await verifyPassword(account.passwordHash, password);

    if (!isValid) {
      await this.fakePasswordDelay();

      logger.warn({
        type: 'SIGNIN_FAILED',
        reason: 'INVALID_PASSWORD',
        email: normalizedEmail,
        ip: meta?.ip,
      });

      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // Load user identity
    const user = await this.userRepository.findById(account.userId);

    if (!user) {
      // extremely rare case (data inconsistency)
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 500);
    }

    // Create session
    const session = await this.createSession(user.id, meta);

    // Logging
    logger.info({
      type: 'SIGNIN_SUCCESS',
      userId: user.id,
      email: user.email,
      ip: meta?.ip,
    });

    // Return response
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

    try {
      // 1. Check if user already exists (identity level)
      const existingUser = await this.userRepository.findByEmail(normalizedEmail);

      if (existingUser) {
        // check if local account already exists
        const existingLocalAccount = await this.accountRepository.findByUserIdAndProvider(existingUser.id, 'local');

        // already has password login → block
        if (existingLocalAccount) {
          throw new AppError(ERROR_CODES.ACCOUNT_EXISTS, 400);
        }

        // CASE: user exists via OAuth (e.g. GitHub) → add local login
        const passwordHash = await hashPassword(password);

        await this.accountRepository.create({
          userId: existingUser.id,
          provider: 'local',
          providerId: normalizedEmail,
          passwordHash,
        });

        // send verification email (important fix)
        const token = generateVerificationToken();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

        await this.tokenRepository.createVerification({
          userId: existingUser.id,
          token,
          expiresAt,
          used: false,
        });

        await sendVerificationEmail(existingUser.email, token);

        return toPublicUser(existingUser);
      }

      const user = await this.userRepository.create({
        name: normalizedName,
        email: normalizedEmail,
        isVerified: false,
      });

      // create local account
      const passwordHash = await hashPassword(password);

      await this.accountRepository.create({
        userId: user.id,
        provider: 'local',
        providerId: normalizedEmail,
        passwordHash,
      });

      // email verification
      const token = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      await this.tokenRepository.createVerification({
        userId: user.id,
        token,
        expiresAt,
        used: false,
      });

      await sendVerificationEmail(user.email, token);

      return toPublicUser(user);
    } catch (err: any) {
      throw err;
    }
  }

  async logout(sessionId: string) {
    await this.sessionRepository.revoke(sessionId);

    logger.info({
      type: 'LOGOUT',
      sessionId,
    });

    return { success: true };
  }

  async logoutAll(userId: number) {
    await this.sessionRepository.revokeAll(userId);

    logger.info({
      type: 'LOGOUT_ALL',
      userId,
    });

    return { success: true };
  }

  async getUserSessions(userId: number) {
    return this.sessionRepository.findActiveByUserId(userId);
  }

  async revokeSession(sessionId: string, userId: number) {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session || session.userId !== userId) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 401);
    }

    await this.sessionRepository.revoke(sessionId);

    return { success: true };
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

    const token = generateResetToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 min

    await this.tokenRepository.createPasswordReset({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await sendPasswordResetEmail(user.email, token);

    logger.info({
      type: 'PASSWORD_RESET_REQUEST_SENT',
      userId: user.id,
      email: user.email,
    });

    return { success: true };
  }
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashToken(token);

    const record = await this.tokenRepository.findPasswordResetByHash(tokenHash);

    if (!record) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'INVALID_TOKEN',
      });

      throw new Error('Invalid token');
    }

    if (record.used) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'TOKEN_ALREADY_USED',
        userId: record.userId,
      });

      throw new Error('Token already used');
    }

    if (record.expiresAt < new Date()) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'TOKEN_EXPIRED',
        userId: record.userId,
      });

      throw new Error('Token expired');
    }

    // 1. Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // 2. Update LOCAL account (NOT users anymore)
    await this.accountRepository.updatePasswordHash(record.userId, 'local', hashedPassword);

    // 3. Mark token as used
    await this.tokenRepository.markPasswordResetUsed(record.id);

    // 4. Invalidate ALL sessions (security best practice)
    await this.sessionRepository.revokeAll(record.userId);

    logger.info({
      type: 'PASSWORD_RESET_SUCCESS',
      userId: record.userId,
    });

    return { success: true };
  }

  async verifyEmail(token: string) {
    const record = await this.tokenRepository.findVerificationByToken(token);

    // constant error (no leaks)
    if (!record || record.used || record.expiresAt < new Date()) {
      logger.warn({
        type: 'EMAIL_VERIFICATION_FAILED',
        reason: 'INVALID_TOKEN',
      });

      throw new AppError(ERROR_CODES.UNKNOWN, 400);
    }

    // delete token (better than marking used)
    await this.tokenRepository.deleteVerificationByToken(token);

    // activate user
    await this.userRepository.updateVerified(record.userId, true);

    logger.info({
      type: 'EMAIL_VERIFICATION_SUCCESS',
      userId: record.userId,
    });

    return { success: true };
  }

  private async fakePasswordDelay() {
    await new Promise((res) => setTimeout(res, 80));
  }

  async oauthLogin(profile: {
    githubId: string;
    email?: string;
    name: string;
  }) {
    // 1. Try find account by GitHub providerId
    let account = await this.accountRepository.findByProviderAndId('github', profile.githubId);

    let user: any;

    // CASE 1: existing GitHub account
    if (account) {
      user = await this.userRepository.findById(account.userId);
    }

    // 2. If no account → try email linking
    if (!account) {
      if (profile.email) {
        user = await this.userRepository.findByEmail(profile.email);
      }

      // 👤 3. Create user if none exists
      if (!user) {
        user = await this.userRepository.create({
          email:
            profile.email ?? `github_${profile.githubId}@placeholder.com`,
          name: profile.name,
          isVerified: true,
        });
      }

      // 4. Create GitHub account linked to user
      await this.accountRepository.create({
        userId: user.id,
        provider: 'github',
        providerId: profile.githubId,
      });
    }

    // 5. Create session
    const session = await this.createSession(user.id);

    return {
      user,
      sessionId: session.id,
    };
  }

  private async createSession(
    userId: number,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const sessionId = generateSessionId();

    const expiresAt = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
    );

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

    return session;
  }
}
