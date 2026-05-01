import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { normalizeEmail, normalizeString } from '../common/utils/normalize';
import { hashPassword, verifyPassword } from './utils/password';
import { toPublicUser } from './mappers/user.mapper';
import { generateVerificationToken } from './utils/token';
import { sendVerificationEmail } from './email.service';
import { eq } from 'drizzle-orm';
import { AppError } from '../common/errors/app.error';
import { ERROR_CODES } from '../common/errors/error-codes';
import { AuditService } from 'src/common/audit/audit.service';
import { generateSessionId } from './utils/session';

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
    console.log('AuthService.signin called with email:', email);
    const normalizedEmail = normalizeEmail(email);

    console.log('Looking up user with email:', normalizedEmail);
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);

    console.log('User lookup result:', user ? 'User found' : 'No user found');
    if (!user) {
      await this.fakePasswordDelay();
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    console.log('User isVerified status:', user.isVerified);
    if (!user.isVerified) {
      await this.fakePasswordDelay();
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    const isValid = await verifyPassword(user.passwordHash, password);

    console.log('Password verification result:', isValid);
    if (!isValid) {
      await this.fakePasswordDelay();
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // session creation
    const sessionId = generateSessionId();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await this.db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
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
