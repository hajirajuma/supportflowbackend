import { PartialType } from '@nestjs/swagger';
import { CreatePlatformOrganizationDto } from './create-platform-organization.dto';

export class UpdatePlatformOrganizationDto extends PartialType(
  CreatePlatformOrganizationDto,
) {}
