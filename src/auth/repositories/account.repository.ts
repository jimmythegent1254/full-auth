import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class AccountRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async findByProviderAndId(provider: string, providerId: string): Promise<typeof schema.accounts.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.provider, provider),
          eq(schema.accounts.providerId, providerId),
        ),
      )
      .limit(1);
    return result[0] || null;
  }

  async findByUserIdAndProvider(userId: number, provider: string): Promise<typeof schema.accounts.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, provider),
        ),
      )
      .limit(1);
    return result[0] || null;
  }

  async create(data: typeof schema.accounts.$inferInsert): Promise<typeof schema.accounts.$inferSelect> {
    const result = await this.db
      .insert(schema.accounts)
      .values(data)
      .returning();
    return result[0];
  }

  async updatePasswordHash(userId: number, provider: string, passwordHash: string): Promise<void> {
    await this.db
      .update(schema.accounts)
      .set({ passwordHash })
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, provider),
        ),
      );
  }
}