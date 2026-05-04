import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class SessionRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async create(data: typeof schema.sessions.$inferInsert): Promise<typeof schema.sessions.$inferSelect> {
    const result = await this.db
      .insert(schema.sessions)
      .values(data)
      .returning();
    return result[0];
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, sessionId));
  }

  async revokeAll(userId: number): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.userId, userId));
  }

  async findActiveByUserId(userId: number): Promise<Array<{
    id: string;
    createdAt: Date;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  }>> {
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

  async findById(sessionId: string): Promise<typeof schema.sessions.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);
    return result[0] || null;
  }
}