import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { RequestWithUser } from '../types/auth/request-with-user';
import { logger } from '../common/logger/logger';

@Controller('users')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    logger.info({
      type: 'GET_ME_REQUEST',
      userId: req.user!.id,
    });
    return this.usersService.getById(req.user!.id);
  }
}
