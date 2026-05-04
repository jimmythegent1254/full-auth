import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from 'src/common/common.module';
import { DatabaseModule } from 'src/database/database.module';
import { AccountRepository } from './repositories/account.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GithubStrategy } from './strategies/github.strategy';
import { SessionRepository } from './repositories/session.repository';
import { TokenRepository } from './repositories/token.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    PassportModule.register({ session: false }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GithubStrategy, UserRepository, AccountRepository, SessionRepository, TokenRepository],
})
export class AuthModule {}
