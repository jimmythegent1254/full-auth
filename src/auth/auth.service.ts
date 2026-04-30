import {
  Injectable,
  ConflictException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { normalizeEmail, normalizeString } from '../common/utils/normalize';
import { hashPassword } from './utils/password';
import { toPublicUser } from './mappers/user.mapper';
import { generateVerificationToken } from './utils/token';
import { sendVerificationEmail } from './email.service';
import { eq } from 'drizzle-orm';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async signup(name: string, email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeString(name);

    const passwordHash = await hashPassword(password);

    // 1. create user
    const [user] = await this.db
      .insert(schema.users)
      .values({
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
      })
      .returning();

    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    // 2. create token
    await this.db.insert(schema.verificationTokens).values({
      userId: user.id,
      token,
      expiresAt,
      used: false,
    });

    // 3. send email
    await sendVerificationEmail(user.email, token);

    return toPublicUser(user);
  }
  async verifyEmail(token: string) {
    const [record] = await this.db
      .select()
      .from(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token))
      .limit(1);

    if (!record) {
      throw new BadRequestException('Invalid token');
    }

    if (record.used) {
      throw new BadRequestException('Token already used');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Token expired');
    }

    await this.db
      .update(schema.verificationTokens)
      .set({ used: true })
      .where(eq(schema.verificationTokens.token, token));

    await this.db
      .update(schema.users)
      .set({ isVerified: true })
      .where(eq(schema.users.id, record.userId));

    return { success: true };
  }

  private isUniqueViolation(err: any): boolean {
    return err?.code === '23505' || err?.constraint === 'users_email_unique';
  }
}
