import { PartialType } from '@nestjs/swagger';
import { CreateFeedbackFormDto } from './create-feedback-form.dto';

export class UpdateFeedbackFormDto extends PartialType(CreateFeedbackFormDto) {}
