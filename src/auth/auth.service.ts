import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { AuditService } from 'src/common/audit/audit.service';
import { AppError } from '../common/errors/app.error';
import { ERROR_CODES } from '../common/errors/error-codes';
import { logger } from '../common/logger/logger';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { hashPassword, verifyPassword } from '../utils/crypto/password';
import { generateResetToken, hashToken } from '../utils/crypto/reset-token';
import { generateSessionId } from '../utils/crypto/session';
import { generateVerificationToken } from '../utils/crypto/token';
import { normalizeEmail, normalizeString } from '../utils/string/normalize';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.service';
import { toPublicUser } from './mappers/user.mapper';
const UAParser = require('ua-parser-js');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
    private readonly audit: AuditService,
  ) {}

  async signin(
    email: string,
    password: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const normalizedEmail = normalizeEmail(email);

    // Find LOCAL account (not user)
    const [account] = await this.db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.provider, 'local'),
          eq(schema.accounts.providerId, normalizedEmail),
        ),
      )
      .limit(1);

    // Prevent user enumeration + fake delay
    if (!account || !account.passwordHash) {
      await this.fakePasswordDelay();

      logger.warn({
        type: 'SIGNIN_FAILED',
        reason: 'ACCOUNT_NOT_FOUND',
        email: normalizedEmail,
        ip: meta?.ip,
      });

      this.audit.logSigninFailure({
        email: normalizedEmail,
        reason: 'ACCOUNT_NOT_FOUND',
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

      this.audit.logSigninFailure({
        email: normalizedEmail,
        reason: 'INVALID_PASSWORD',
        ip: meta?.ip,
      });

      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // Load user identity
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, account.userId))
      .limit(1);

    if (!user) {
      // extremely rare case (data inconsistency)
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, 500);
    }

    // Create session
    const sessionId = generateSessionId();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const parser = new UAParser(meta?.userAgent);
    const ua = parser.getResult();

    const deviceLabel = `${ua.browser.name ?? 'Unknown'} on ${ua.os.name ?? 'Unknown'}`;

    await this.db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt,
      ip: meta?.ip,
      userAgent: deviceLabel,
    });

    // Logging
    logger.info({
      type: 'SIGNIN_SUCCESS',
      userId: user.id,
      email: user.email,
      ip: meta?.ip,
    });

    this.audit.logSigninSuccess({
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
      sessionId,
    };
  }

  async signup(name: string, email: string, password: string, ip?: string) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeString(name);

    try {
      // 🧱 1. Check if user already exists (identity level)
      const existingUser = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, normalizedEmail))
        .limit(1)
        .then((r) => r[0]);

      if (existingUser) {
        // 🔐 check if local account already exists
        const existingLocalAccount = await this.db
          .select()
          .from(schema.accounts)
          .where(
            and(
              eq(schema.accounts.userId, existingUser.id),
              eq(schema.accounts.provider, 'local'),
            ),
          )
          .limit(1)
          .then((r) => r[0]);

        // already has password login → block
        if (existingLocalAccount) {
          this.audit.logSignupFailure({
            email: normalizedEmail,
            reason: 'ACCOUNT_EXISTS',
            ip,
          });

          throw new AppError(ERROR_CODES.ACCOUNT_EXISTS, 400);
        }

        // CASE: user exists via OAuth (e.g. GitHub) → add local login
        const passwordHash = await hashPassword(password);

        await this.db.insert(schema.accounts).values({
          userId: existingUser.id,
          provider: 'local',
          providerId: normalizedEmail,
          passwordHash,
        });

        // send verification email (important fix)
        const token = generateVerificationToken();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

        await this.db.insert(schema.verificationTokens).values({
          userId: existingUser.id,
          token,
          expiresAt,
          used: false,
        });

        await sendVerificationEmail(existingUser.email, token);

        this.audit.logSignupSuccess({
          userId: existingUser.id,
          email: existingUser.email,
          ip,
        });

        return toPublicUser(existingUser);
      }

      const [user] = await this.db
        .insert(schema.users)
        .values({
          name: normalizedName,
          email: normalizedEmail,
          isVerified: false,
        })
        .returning();

      // create local account
      const passwordHash = await hashPassword(password);

      await this.db.insert(schema.accounts).values({
        userId: user.id,
        provider: 'local',
        providerId: normalizedEmail,
        passwordHash,
      });

      // email verification
      const token = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      await this.db.insert(schema.verificationTokens).values({
        userId: user.id,
        token,
        expiresAt,
        used: false,
      });

      await sendVerificationEmail(user.email, token);

      this.audit.logSignupSuccess({
        userId: user.id,
        email: user.email,
        ip,
      });

      return toPublicUser(user);
    } catch (err: any) {
      this.audit.logSignupFailure({
        email: normalizedEmail,
        reason: 'UNKNOWN_ERROR',
        ip,
      });

      throw err;
    }
  }

  async logout(sessionId: string) {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, sessionId));

    logger.info({
      type: 'LOGOUT',
      sessionId,
    });

    this.audit.logSignout({
      sessionId,
    });

    return { success: true };
  }

  async logoutAll(userId: number) {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.userId, userId));

    logger.info({
      type: 'LOGOUT_ALL',
      userId,
    });

    this.audit.logSignout({
      userId,
      allSessions: true,
    });

    return { success: true };
  }

  async getUserSessions(userId: number) {
    return this.db
      .select({
        id: schema.sessions.id,
        createdAt: schema.sessions.createdAt,
        expiresAt: schema.sessions.expiresAt,
        userAgent: schema.sessions.userAgent,
        ip: schema.sessions.ip,
      })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, userId),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, new Date()),
        ),
      );
  }

  async revokeSession(sessionId: string, userId: number) {
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session || session.userId !== userId) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 401);
    }

    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, sessionId));

    return { success: true };
  }

  async requestPasswordReset(email: string) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!user) {
      logger.warn({
        type: 'PASSWORD_RESET_REQUEST_FAILED',
        reason: 'USER_NOT_FOUND',
        email,
      });
      this.audit.logPasswordResetRequest({
        email,
        success: false,
        reason: 'USER_NOT_FOUND',
      });
      return { success: true };
    }

    const token = generateResetToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 min

    await this.db.insert(schema.passwordResetTokens).values({
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

    this.audit.logPasswordResetRequest({
      email,
      success: true,
      userId: user.id,
    });

    return { success: true };
  }
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashToken(token);

    const record = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
      .limit(1)
      .then((res) => res[0]);

    if (!record) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'INVALID_TOKEN',
      });

      this.audit.logPasswordReset({
        success: false,
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

      this.audit.logPasswordReset({
        userId: record.userId,
        success: false,
        reason: 'TOKEN_ALREADY_USED',
      });

      throw new Error('Token already used');
    }

    if (record.expiresAt < new Date()) {
      logger.warn({
        type: 'PASSWORD_RESET_FAILED',
        reason: 'TOKEN_EXPIRED',
        userId: record.userId,
      });

      this.audit.logPasswordReset({
        userId: record.userId,
        success: false,
        reason: 'TOKEN_EXPIRED',
      });

      throw new Error('Token expired');
    }

    // 🔐 1. Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // 🧠 2. Update LOCAL account (NOT users anymore)
    await this.db
      .update(schema.accounts)
      .set({ passwordHash: hashedPassword })
      .where(
        and(
          eq(schema.accounts.userId, record.userId),
          eq(schema.accounts.provider, 'local'),
        ),
      );

    // 🧨 3. Mark token as used
    await this.db
      .update(schema.passwordResetTokens)
      .set({ used: true })
      .where(eq(schema.passwordResetTokens.id, record.id));

    // 🔒 4. Invalidate ALL sessions (security best practice)
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.userId, record.userId));

    logger.info({
      type: 'PASSWORD_RESET_SUCCESS',
      userId: record.userId,
    });

    this.audit.logPasswordReset({
      userId: record.userId,
      success: true,
    });

    return { success: true };
  }
  async verifyEmail(token: string) {
    const [record] = await this.db
      .select()
      .from(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token))
      .limit(1);

    // constant error (no leaks)
    if (!record || record.used || record.expiresAt < new Date()) {
      logger.warn({
        type: 'EMAIL_VERIFICATION_FAILED',
        reason: 'INVALID_TOKEN',
      });
      this.audit.logEmailVerification({
        success: false,
        reason: 'INVALID_TOKEN',
      });
      throw new AppError(ERROR_CODES.UNKNOWN, 400);
    }

    // delete token (better than marking used)
    await this.db
      .delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token));

    // activate user
    await this.db
      .update(schema.users)
      .set({ isVerified: true })
      .where(eq(schema.users.id, record.userId));

    logger.info({
      type: 'EMAIL_VERIFICATION_SUCCESS',
      userId: record.userId,
    });

    this.audit.logEmailVerification({
      userId: record.userId,
      success: true,
    });

    return { success: true };
  }

  private isUniqueViolation(err: any): boolean {
    return (
      err?.code === '23505' || // postgres unique violation
      err?.constraint === 'users_email_unique'
    );
  }

  private async fakePasswordDelay() {
    await new Promise((res) => setTimeout(res, 80));
  }

  async oauthLogin(profile: {
    githubId: string;
    email?: string;
    name: string;
  }) {
    // 🧱 1. Try find account by GitHub providerId
    let account = await this.db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.provider, 'github'),
          eq(schema.accounts.providerId, profile.githubId),
        ),
      )
      .limit(1)
      .then((res) => res[0]);

    let user: any;

    // 👇 CASE 1: existing GitHub account
    if (account) {
      user = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, account.userId))
        .then((res) => res[0]);
    }

    // 🧠 2. If no account → try email linking
    if (!account) {
      if (profile.email) {
        user = await this.db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, profile.email))
          .then((res) => res[0]);
      }

      // 👤 3. Create user if none exists
      if (!user) {
        const [createdUser] = await this.db
          .insert(schema.users)
          .values({
            email:
              profile.email ?? `github_${profile.githubId}@placeholder.com`,
            name: profile.name,
            isVerified: true,
          })
          .returning();

        user = createdUser;
      }

      // 🔗 4. Create GitHub account linked to user
      await this.db.insert(schema.accounts).values({
        userId: user.id,
        provider: 'github',
        providerId: profile.githubId,
      });
    }

    // 🍪 5. Create session
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
    const sessionId = crypto.randomUUID();

    const expiresAt = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
    );

    const [session] = await this.db
      .insert(schema.sessions)
      .values({
        id: sessionId,
        userId,
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      })
      .returning();

    return session;
  }
}
