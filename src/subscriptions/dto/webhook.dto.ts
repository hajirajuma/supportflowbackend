import { ApiProperty } from '@nestjs/swagger';

/**
 * Webhook payload from PayChangu. Deliberately schema-free at the DTO level
 * because the raw body is required for signature verification; the parsed event
 * is handled by WebhookService against known event shapes.
 */
export class WebhookDto {
  [key: string]: unknown;

  @ApiProperty({
    example: 'payment.successful',
    description: 'Event name/type emitted by the gateway.',
  })
  event?: string;
}
