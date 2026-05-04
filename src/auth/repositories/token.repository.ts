import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class TokenRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  // Verification Tokens
  async createVerification(data: typeof schema.verificationTokens.$inferInsert): Promise<typeof schema.verificationTokens.$inferSelect> {
    const result = await this.db
      .insert(schema.verificationTokens)
      .values(data)
      .returning();
    return result[0];
  }

  async findVerificationByToken(token: string): Promise<typeof schema.verificationTokens.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token))
      .limit(1);
    return result[0] || null;
  }

  async deleteVerificationByToken(token: string): Promise<void> {
    await this.db
      .delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token));
  }

  // Password Reset Tokens
  async createPasswordReset(data: typeof schema.passwordResetTokens.$inferInsert): Promise<typeof schema.passwordResetTokens.$inferSelect> {
    const result = await this.db
      .insert(schema.passwordResetTokens)
      .values(data)
      .returning();
    return result[0];
  }

  async findPasswordResetByHash(tokenHash: string): Promise<typeof schema.passwordResetTokens.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return result[0] || null;
  }

  async markPasswordResetUsed(id: number): Promise<void> {
    await this.db
      .update(schema.passwordResetTokens)
      .set({ used: true })
      .where(eq(schema.passwordResetTokens.id, id));
  }
}