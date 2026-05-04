import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class UserRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async findByEmail(email: string): Promise<typeof schema.users.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return result[0] || null;
  }

  async findById(id: number): Promise<typeof schema.users.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return result[0] || null;
  }

  async create(data: typeof schema.users.$inferInsert): Promise<typeof schema.users.$inferSelect> {
    const result = await this.db
      .insert(schema.users)
      .values(data)
      .returning();
    return result[0];
  }

  async updateVerified(id: number, isVerified: boolean): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ isVerified })
      .where(eq(schema.users.id, id));
  }
}