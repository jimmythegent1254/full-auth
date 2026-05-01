import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { Throttle } from '@nestjs/throttler';
import { IpAddress } from 'src/common/decorators/ip.decorator';
import { SigninDto } from './dto/signin.dto';
import { SessionGuard } from './guards/session.guard';
import type { RequestWithUser } from './types/request-with-user';
import { clearSessionCookie } from 'src/common/http/http-context';
import { logger } from 'src/common/logger/logger';

const isProd = process.env.NODE_ENV === 'production';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async signup(@Body() body: SignupDto, @IpAddress() ip: string) {
    logger.info({
      type: 'SIGNUP_REQUEST',
      email: body.email,
      ip,
    });
    return this.authService.signup(body.name, body.email, body.password, ip);
  }

  @Post('signin')
  async login(
    @Body() body: SigninDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    logger.info({
      type: 'SIGNIN_REQUEST',
      email: body.email,
      ip: req.ip,
    });

    const result = await this.authService.signin(body.email, body.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie('sessionId', result.sessionId, {
      httpOnly: true,
      secure: isProd, // false in dev if needed
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });

    return result.user;
  }

  @Get('sessions')
  @UseGuards(SessionGuard)
  async getSessions(@Req() req: RequestWithUser) {
    logger.info({
      type: 'GET_SESSIONS_REQUEST',
      userId: req.user!.id,
    });

    const sessions = await this.authService.getUserSessions(req.user!.id);

    const currentSessionId = req.cookies.sessionId;

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));
  }
  @Delete('sessions/:id')
  @UseGuards(SessionGuard)
  async revokeSession(@Param('id') id: string, @Req() req: RequestWithUser) {
    logger.info({
      type: 'REVOKE_SESSION_REQUEST',
      userId: req.user!.id,
      sessionId: id,
    });
    return this.authService.revokeSession(id, req.user!.id);
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.cookies?.sessionId;

    logger.info({
      type: 'LOGOUT_REQUEST',
      userId: req.user!.id,
      sessionId,
    });

    await this.authService.logout(sessionId);

    clearSessionCookie(res);

    return { success: true };
  }

  @Post('logout-all')
  @UseGuards(SessionGuard)
  async logoutAll(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    logger.info({
      type: 'LOGOUT_ALL_REQUEST',
      userId: req.user!.id,
    });

    await this.authService.logoutAll(req.user!.id);

    clearSessionCookie(res);

    return { success: true };
  }

  @Post('password-reset/request')
  async requestReset(@Body() body: { email: string }) {
    logger.info({
      type: 'PASSWORD_RESET_REQUEST_ENDPOINT',
      email: body.email,
    });
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('password-reset/confirm')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    logger.info({
      type: 'PASSWORD_RESET_CONFIRM_ENDPOINT',
    });
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @Get('verify')
  async verifyEmail(@Query('token') token: string) {
    logger.info({
      type: 'EMAIL_VERIFICATION_ENDPOINT',
    });
    return this.authService.verifyEmail(token);
  }
}
