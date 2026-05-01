import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { Throttle } from '@nestjs/throttler';
import { IpAddress } from 'src/common/decorators/ip.decorator';
import { SigninDto } from './dto/signin.dto';

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
      secure: true, // false in dev if needed
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });

    return result.user;
  }

  @Get('verify')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }
}
