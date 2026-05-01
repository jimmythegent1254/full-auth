import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { RequestWithUser } from '../types/request-with-user';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NeonHttpDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const sessionId = request.cookies?.sessionId;

    if (!sessionId) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 1. find session
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 2. check expiration
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    // 3. check revoked
    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Session revoked');
    }

    // 4. fetch user
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 5. attach user to request
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
    };

    return true;
  }
}
