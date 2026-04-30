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
        const connectionString = configService.get<string>('DATABASE_URL');

        // Optional: Enable fetch connection cache for better performance
        // neonConfig.fetchConnectionCache = true; (if you import neonConfig)

        const sql = neon(connectionString!);
        return drizzle(sql, { schema });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
