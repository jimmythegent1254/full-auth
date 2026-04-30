// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export const DRIZZLE = 'DRIZZLE';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE,
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');

        const client = neon(databaseUrl);

        return drizzle(client, {
          schema,
          // logger: true,   // uncomment during development to see queries
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
