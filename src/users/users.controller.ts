import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { RequestWithUser } from '../types/auth/request-with-user';
import { logger } from '../common/logger/logger';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('users')
@UseGuards(SessionGuard, RolesGuard)
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

  @Get('admin-only')
  @Roles('admin')
  adminRoute() {
    return { secret: 'admin data' };
  }
}
