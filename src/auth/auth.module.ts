import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from 'src/common/common.module';
import { DatabaseModule } from 'src/database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GithubStrategy } from './strategies/github.strategy';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    PassportModule.register({ session: false }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GithubStrategy],
})
export class AuthModule {}
