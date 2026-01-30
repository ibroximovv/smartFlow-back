import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { BaseService } from '@common/infrastructure/baseService';
import { HydratedDocument, Model } from 'mongoose';
import { Budget } from '@common/schema/budget.schema';
import { InjectModel } from '@nestjs/mongoose';
import { GetBudgetDto } from './dto/get-budget.dto';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

@Injectable()
export class BudgetService extends BaseService<HydratedDocument<Budget>, CreateBudgetDto, UpdateBudgetDto> {
  constructor(@InjectModel(Budget.name) budgetModel: Model<HydratedDocument<Budget>>) {
    super(budgetModel);
  }

  async createBudget(createBudgetDto: CreateBudgetDto) {
    try {
      const existingBudget = await this.model.findOne({
        isActive: true,
        department: createBudgetDto.department,
        fiscalYear: createBudgetDto.fiscalYear,
      });

      if (existingBudget) {
        throw new BadRequestException(
          `An active budget already exists for ${createBudgetDto.department} in fiscal year ${createBudgetDto.fiscalYear}`,
        );
      }

      const created = await this.model.create({
        ...createBudgetDto,
        spentAmount: 0,
      });

      return {
        statusCode: 201,
        message: 'Success!',
        data: {
          ...created.toObject(),
          _id: created._id.toString()
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create budget: ${error.message}`);
    }
  }

  async findAllBudget(query: GetBudgetDto) {
    try {
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

      const mongoQuery: any = { ...filters };

      if (search && searchFields) {
        const fields = searchFields.split(',').map((f: string) => f.trim());
        mongoQuery.$or = fields.map((field: string) => ({
          [field]: { $regex: search, $options: 'i' },
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
        data: docs.map((doc) => {
          const obj = doc.toObject({ versionKey: false });
          return {
            ...obj,
            _id: obj._id.toString(),
          };
        }),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      throw new BadRequestException(`Failed to fetch budgets: ${error.message}`);
    }
  }

  async findOneBudget(id: string) {
    try {
      const budget = await this.model.findById(id).exec();

      if (!budget) {
        throw new NotFoundException(`Budget with ID ${id} not found`);
      }

      return {
        ...budget.toObject(),
        _id: budget._id.toString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch budget: ${error.message}`);
    }
  }
}