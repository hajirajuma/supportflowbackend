import { PartialType } from '@nestjs/swagger';
import { CreateKnowledgeCategoryDto } from './create-knowledge-category.dto';

export class UpdateKnowledgeCategoryDto extends PartialType(
  CreateKnowledgeCategoryDto,
) {}
