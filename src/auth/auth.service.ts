import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import * as bcrypt from 'bcrypt';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async signup(name: string, email: string, password: string) {
    // 1. check if user exists
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('User already exists');
    }

    // 2. hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. insert user
    const [user] = await this.db
      .insert(schema.users)
      .values({
        name,
        email,
        passwordHash,
      })
      .returning();

    return user;
  }
}
