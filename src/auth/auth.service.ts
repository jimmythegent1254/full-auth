import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import * as bcrypt from 'bcrypt';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { normalizeEmail, normalizeString } from '../common/utils/normalize';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async signup(name: string, email: string, password: string) {
    // 1. normalize input FIRST
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeString(name);

    // 2. check if user exists (use normalized email!)
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('User already exists');
    }

    // 3. hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. insert user
    const [user] = await this.db
      .insert(schema.users)
      .values({
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
      })
      .returning();

    return user;
  }
}
