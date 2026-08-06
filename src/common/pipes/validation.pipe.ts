import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class TrimStringPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata) {
    if (typeof value === 'string') {
      return value.trim();
    }

    return value;
  }
}

@Injectable()
export class ParseBooleanPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata) {
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();

      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }

    throw new BadRequestException('Expected a boolean value.');
  }
}
