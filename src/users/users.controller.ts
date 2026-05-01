import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { RequestWithUser } from '../auth/types/request-with-user';

@Controller('users')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    return this.usersService.getById(req.user!.id);
  }
}
