import { Module } from '@nestjs/common';
import { BrevoEmailService } from './brevo.service';

@Module({
  providers: [BrevoEmailService],
  exports: [BrevoEmailService],
})
export class EmailModule {}
