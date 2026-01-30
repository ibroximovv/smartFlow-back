import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Document, Model, QueryFilter, UpdateQuery, Types } from 'mongoose';

export class DuplicateKeyError extends ConflictException {
  constructor(fields: string[]) {
    super(`Duplicate value: ${fields.join(', ')}`);
  }
}

export class ValidationError extends BadRequestException {
  constructor(message: string | string[]) {
    super(message);
  }
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

@Injectable()
export abstract class BaseService<
  TDocument extends Document,
  TCreateDto = any,
  TUpdateDto = any,
  TResponseDto = any
> {
  protected constructor(
    protected readonly model: Model<TDocument>,
  ) { }

  async create(dto: TCreateDto): Promise<TResponseDto> {
    try {
      const doc = await new this.model(dto).save();
      return this.mapToFrontend(doc) as TResponseDto;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async findAll(query: any = {}): Promise<PaginatedResponse<TResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search,
      searchFields,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      ...filters
    } = query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const mongoQuery: QueryFilter<TDocument> = { ...filters };

    if (search && searchFields) {
      const fields = searchFields.split(',').map((f: string) => f.trim());
      mongoQuery.$or = fields.map((field: any) => ({
        [field]: { $regex: search, $options: 'i' }
      }));
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(mongoQuery)
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limitNum)
        .exec(),
      this.model.countDocuments(mongoQuery),
    ]);

    return {
      data: docs.map(doc => {
        const obj = doc.toObject({ versionKey: false });

        return {
          ...obj,
          _id: obj._id.toString(),
        };
      }) as TResponseDto[],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };

  }

  async findOne(filter: QueryFilter<TDocument>): Promise<TResponseDto | null> {
    try {
      const doc = await this.model.findOne(filter).exec();
      if (!doc) return null;

      const obj = doc.toObject({ versionKey: false });

      return {
        ...obj,
        _id: obj._id.toString(),
      } as TResponseDto;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async findById(id: string): Promise<TResponseDto | null> {
    try {
      const doc = await this.model.findById(id).exec();
      if (!doc) return null;

      const obj = doc.toObject({ versionKey: false });

      return {
        ...obj,
        _id: obj._id.toString(),
      } as TResponseDto;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }


  async update(id: string, dto: TUpdateDto): Promise<TResponseDto> {
    try {
      const doc = await this.model
        .findByIdAndUpdate(id, dto as UpdateQuery<TDocument>, { new: true, runValidators: true })
        .lean()
        .exec();

      if (!doc) {
        throw new NotFoundException(`Document with id ${id} not found`);
      }

      return this.mapToFrontend(doc) as TResponseDto;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async delete(id: string): Promise<TResponseDto> {
    try {
      const doc = await this.model.findByIdAndDelete(id).lean().exec();

      if (!doc) {
        throw new NotFoundException(`Document with id ${id} not found`);
      }

      return this.mapToFrontend(doc) as TResponseDto;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async softDelete(id: string): Promise<TResponseDto> {
    try {
      const doc = await this.model
        .findByIdAndUpdate(
          id,
          { deletedAt: new Date() } as UpdateQuery<TDocument>,
          { new: true },
        )
        .lean()
        .exec();

      if (!doc) {
        throw new NotFoundException(`Document with id ${id} not found`);
      }

      return this.mapToFrontend(doc) as TResponseDto;
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  protected mapToFrontend(doc: any): any {
    if (!doc) return null;

    const { password, __v, ...rest } = doc;

    const result = this.convertObjectIdsToStrings({ ...rest });

    return {
      ...result,
      _id: doc._id?.toString?.() || doc._id,
    };
  }

  private convertObjectIdsToStrings(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.convertObjectIdsToStrings(item));
    }

    if (obj instanceof Types.ObjectId) {
      return obj.toString();
    }

    if (obj.buffer && obj._bsontype === 'ObjectId') {
      return obj.toString?.() || (obj as any).toHexString?.();
    }

    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = this.convertObjectIdsToStrings(obj[key]);
      }
    }

    return result;
  }

  private handleDatabaseError(error: any): never {
    if (error?.code === 11000) {
      const fields = Object.keys(error.keyValue || {});
      throw new DuplicateKeyError(fields);
    }

    if (error?.name === 'ValidationError') {
      const messages = Object.values(error.errors)
        .map((e: any) => e.message)
        .flat();
      throw new ValidationError(messages);
    }

    if (error?.name === 'CastError') {
      throw new BadRequestException('Invalid ID format');
    }

    if (error?.status) {
      throw error;
    }

    console.error('Database error:', error);
    throw new BadRequestException(
      error?.message || 'An unexpected database error occurred',
    );
  }
}