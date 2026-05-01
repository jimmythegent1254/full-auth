import { Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class CommonModule {}
