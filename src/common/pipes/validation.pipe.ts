import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ValidationPipe implements PipeTransform {
  async transform(value: any, metadata: ArgumentMetadata) {
    const { type, metatype } = metadata;

    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const messages = this.formatErrors(errors);
      throw new BadRequestException({
        statusCode: 400,
        message: messages,
        error: 'Validation failed',
      });
    }

    return value;
  }

  private toValidate(metatype: any): boolean {
    const types = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private formatErrors(errors: any[]): string[] {
    return errors.flatMap((error) =>
      Object.values(error.constraints || {})
    );
  }
}

@Injectable()
export class MongoIdValidationPipe implements PipeTransform {
  transform(value: string, metadata: ArgumentMetadata) {
    const mongoIdRegex = /^[0-9a-fA-F]{24}$/;

    if (!mongoIdRegex.test(value)) {
      throw new BadRequestException('Invalid MongoDB ID format');
    }

    return value;
  }
}

@Injectable()
export class PaginationValidationPipe implements PipeTransform {
  transform(value: any) {
    const { page = 1, limit = 10 } = value;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Page must be a positive number');
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    return { page: pageNum, limit: limitNum };
  }
}