import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { normalizeEmail, normalizeString } from '../common/utils/normalize';
import { hashPassword, verifyPassword } from './utils/password';
import { toPublicUser } from './mappers/user.mapper';
import { generateVerificationToken } from './utils/token';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.service';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AppError } from '../common/errors/app.error';
import { ERROR_CODES } from '../common/errors/error-codes';
import { AuditService } from 'src/common/audit/audit.service';
import { generateSessionId } from './utils/session';
import { generateResetToken, hashToken } from './utils/reset-token';
import { passwordResetTokens } from '../database/schema';
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

    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      await this.fakePasswordDelay();
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    if (!user.isVerified) {
      await this.fakePasswordDelay();
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    const isValid = await verifyPassword(user.passwordHash, password);

    if (!isValid) {
      await this.fakePasswordDelay();
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // session creation
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

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      sessionId, // sent to controller for cookie
    };
  }

  async signup(name: string, email: string, password: string, ip?: string) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeString(name);

    const passwordHash = await hashPassword(password);

    try {
      // 1. create user
      const [user] = await this.db
        .insert(schema.users)
        .values({
          name: normalizedName,
          email: normalizedEmail,
          passwordHash,
        })
        .returning();

      // 2. create verification token
      const token = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      await this.db.insert(schema.verificationTokens).values({
        userId: user.id,
        token,
        expiresAt,
        used: false,
      });

      this.audit.logSignupSuccess({
        userId: user.id,
        email: user.email,
        ip,
      });

      // 3. send email
      await sendVerificationEmail(user.email, token);

      return toPublicUser(user);
    } catch (err: any) {
      // handle unique constraint safely
      if (this.isUniqueViolation(err)) {
        throw new AppError(ERROR_CODES.ACCOUNT_EXISTS, 400);
      }

      this.audit.logSignupFailure({
        email: normalizedEmail,
        reason: 'UNKNOWN_ERROR',
        ip,
      });

      throw err; // let global filter handle unknowns
    }
  }

  async logout(sessionId: string) {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, sessionId));

    return { success: true };
  }

  async logoutAll(userId: number) {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.userId, userId));

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

    if (!user) return { success: true };

    const token = generateResetToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 min

    await this.db.insert(schema.passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await sendPasswordResetEmail(user.email, token);

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

    if (!record) throw new Error('Invalid token');
    if (record.used) throw new Error('Token already used');
    if (record.expiresAt < new Date()) throw new Error('Token expired');

    // 1. update password
    const hashedPassword = await hashPassword(newPassword);

    await this.db
      .update(schema.users)
      .set({ passwordHash: hashedPassword })
      .where(eq(schema.users.id, record.userId));

    // 2. mark token used
    await this.db
      .update(schema.passwordResetTokens)
      .set({ used: true })
      .where(eq(schema.passwordResetTokens.id, record.id));

    // 3. invalidate ALL sessions
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.userId, record.userId));

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
}
