import { PartialType } from '@nestjs/swagger';
import { CreatePlatformUserDto } from './create-platform-user.dto';

export class UpdatePlatformUserDto extends PartialType(CreatePlatformUserDto) {}
