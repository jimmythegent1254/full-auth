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

const isProd = process.env.NODE_ENV === 'production';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(@Body() body: SignupDto, @IpAddress() ip: string) {
    return this.authService.signup(body.name, body.email, body.password, ip);
  }

  @Post('signin')
  async login(
    @Body() body: SigninDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log('Signin attempt from IP:', req.ip);
    const result = await this.authService.signin(body.email, body.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    console.log('Signin successful for user:', result.user.email);

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
    return this.authService.revokeSession(id, req.user!.id);
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.cookies?.sessionId;

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
    await this.authService.logoutAll(req.user!.id);

    clearSessionCookie(res);

    return { success: true };
  }

  @Get('verify')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }
}
