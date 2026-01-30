import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { BaseService } from '@common/infrastructure/baseService';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentEntity } from '@common/schema/document.schema';
import { HydratedDocument, Model } from 'mongoose';
import { RequestWithUser } from '@common/types';
import { AssetPayloadDto, ExpensePayloadDto, LeavePayloadDto } from './dto/payload-document.dto';
import { DocumentAction, DocumentStatus, DocumentType } from '@common/constants';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { User } from '@common/schema/user.schema';

@Injectable()
export class DocumentService extends BaseService<HydratedDocument<DocumentEntity>, CreateDocumentDto, UpdateDocumentDto> {
  constructor(
    @InjectModel(DocumentEntity.name) documentModel: Model<HydratedDocument<DocumentEntity>>,
    @InjectModel(User.name) private userModel: Model<HydratedDocument<User>>
  ) {
    super(documentModel)
  }

  async createNewDocument(
    req: RequestWithUser,
    createDocumentDto: CreateDocumentDto,
  ) {
    try {
      const { type, payload, comment } = createDocumentDto;

      let validatedPayload:
        | ExpensePayloadDto
        | LeavePayloadDto
        | AssetPayloadDto;

      const transformedPayload = this.transformPayload(payload, type);

      switch (type) {
        case DocumentType.EXPENSE:
          validatedPayload = plainToInstance(ExpensePayloadDto, transformedPayload);
          break;

        case DocumentType.LEAVE:
          validatedPayload = plainToInstance(LeavePayloadDto, transformedPayload);
          break;

        case DocumentType.ASSET:
          validatedPayload = plainToInstance(AssetPayloadDto, transformedPayload);
          break;

        default:
          throw new BadRequestException('Invalid document type');
      }

      const errors = await validate(validatedPayload, {
        skipMissingProperties: false,
        whitelist: true,
      });

      if (errors.length > 0) {
        const messages = errors
          .map(error => Object.values(error.constraints || {}))
          .flat();
        throw new BadRequestException(messages);
      }

      const creator = await this.userModel.findById(req.user.id);
      if (!creator) {
        throw new BadRequestException('Creator not found!');
      }

      const document = await this.model.create({
        serialNumber: createDocumentDto.serialNumber,
        type,
        payload: validatedPayload,
        creatorId: creator._id,
        status: DocumentStatus.DRAFT,
        currentStep: 1,
        history: [
          {
            userId: creator._id.toString(),
            comment,
            action: DocumentAction.SUBMIT,
            timestamp: new Date()
          }
        ]
      });

      document.save()

      return {
        statusCode: 201,
        message: 'Success!',
        data: {
          _id: document._id.toString(),
          serialNumber: document.serialNumber,
          type: document.type,
          payload: document.payload,
          creatorId: document.creatorId.toString(),
          status: document.status,
          currentStep: document.currentStep,
          history: document.history,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        error.message || 'Internal server error!',
      );
    }
  }

  private transformPayload(payload: any, type: DocumentType): any {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid payload');
    }

    const transformed = { ...payload };

    switch (type) {
      case DocumentType.EXPENSE:
        if (transformed.amount !== undefined && typeof transformed.amount === 'string') {
          transformed.amount = parseFloat(transformed.amount);
        }
        break;

      case DocumentType.LEAVE:
        if (transformed.startDate && typeof transformed.startDate === 'string') {
          transformed.startDate = new Date(transformed.startDate);
        }
        if (transformed.endDate && typeof transformed.endDate === 'string') {
          transformed.endDate = new Date(transformed.endDate);
        }
        if (transformed.totalDays !== undefined && typeof transformed.totalDays === 'string') {
          transformed.totalDays = parseInt(transformed.totalDays, 10);
        }
        break;

      case DocumentType.ASSET:
        if (transformed.estimatedCost !== undefined && typeof transformed.estimatedCost === 'string') {
          transformed.estimatedCost = parseFloat(transformed.estimatedCost);
        }
        if (transformed.quantity !== undefined && typeof transformed.quantity === 'string') {
          transformed.quantity = parseInt(transformed.quantity, 10);
        }
        break;
    }

    return transformed;
  }
}