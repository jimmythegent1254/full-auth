import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from 'src/common/common.module';
import { DatabaseModule } from 'src/database/database.module';
import { AccountRepository } from './repositories/account.repository';
import { AuthDomainService } from './services/auth-domain.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailService } from './email.service';
import { GithubStrategy } from './strategies/github.strategy';
import { SecurityService } from './services/security.service';
import { SessionRepository } from './repositories/session.repository';
import { SessionService } from './services/session.service';
import { TokenRepository } from './repositories/token.repository';
import { TokenService } from './services/token.service';
import { UserRepository } from './repositories/user.repository';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    PassportModule.register({ session: false }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthDomainService,
    GithubStrategy,
    UserRepository,
    AccountRepository,
    SessionRepository,
    TokenRepository,
    EmailService,
    SecurityService,
    TokenService,
    SessionService,
  ],
})
export class AuthModule {}
