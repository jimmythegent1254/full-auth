import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { logger } from '../common/logger/logger';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async getById(id: number) {
    logger.info({
      type: 'GET_USER_BY_ID',
      userId: id,
    });

    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        isVerified: schema.users.isVerified,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (!user) {
      logger.warn({
        type: 'GET_USER_BY_ID_FAILED',
        reason: 'USER_NOT_FOUND',
        userId: id,
      });
    }

    return user;
  }
}
