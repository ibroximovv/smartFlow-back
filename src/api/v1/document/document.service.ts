import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { BaseService } from '@common/infrastructure/baseService';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentEntity } from '@common/schema/document.schema';
import { HydratedDocument, Model, ClientSession } from 'mongoose';
import { AssetPayloadDto, ExpensePayloadDto, LeavePayloadDto } from './dto/payload-document.dto';
import { DocumentType } from '@common/constants';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { User } from '@common/schema/user.schema';
import { Budget } from '@common/schema/budget.schema';
import { Asset } from '@common/schema/asset.schema';

@Injectable()
export class DocumentService extends BaseService<HydratedDocument<DocumentEntity>, CreateDocumentDto, UpdateDocumentDto> {
  constructor(
    @InjectModel(DocumentEntity.name) documentModel: Model<HydratedDocument<DocumentEntity>>,
    @InjectModel(User.name) private userModel: Model<HydratedDocument<User>>,
    @InjectModel(Budget.name) private budgetModel: Model<HydratedDocument<Budget>>,
    @InjectModel(Asset.name) private assetModel: Model<HydratedDocument<Asset>>,
  ) {
    super(documentModel);
  }

  /**
   * Create new document in DRAFT status
   */
  async createNewDocument(
    req: any,
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

      const creator = await this.userModel.findById(req['user'].id);
      if (!creator) {
        throw new BadRequestException('Creator not found!');
      }

      const document = await this.model.create({
        serialNumber: createDocumentDto.serialNumber,
        type,
        payload: validatedPayload,
        creatorId: creator._id.toString(),
        status: 'DRAFT',
        currentStep: 0,
        history: [
          {
            userId: creator._id.toString(),
            comment,
            action: 'CREATE',
            timestamp: new Date().toISOString(),
          }
        ]
      });

      await document.save();

      return {
        statusCode: 201,
        message: 'Success!',
        data: this.formatDocument(document),
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

  /**
   * Transform and validate payload based on document type
   */
  private transformPayload(payload: any, type: DocumentType): any {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid payload');
    }

    const transformed = { ...payload };

    // Fix common typo: currensy → currency
    if (transformed.currensy && !transformed.currency) {
      transformed.currency = transformed.currensy;
      delete transformed.currensy;
    }

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

  /**
   * Format document response
   * Convert all IDs to strings, timestamps to ISO format
   */
  private formatDocument(doc: HydratedDocument<DocumentEntity>) {
    const obj = doc.toObject();
    
    return {
      _id: obj._id?.toString(),
      serialNumber: obj.serialNumber,
      type: obj.type,
      status: obj.status,
      currentStep: obj.currentStep,
      payload: obj.payload,
      creatorId: obj.creatorId?.toString ? obj.creatorId.toString() : obj.creatorId,
      rejectionReason: obj.rejectionReason || null,
      history: (obj.history || []).map(item => ({
        userId: item.userId?.toString ? item.userId.toString() : item.userId,
        action: item.action,
        comment: item.comment || null,
        timestamp: item.timestamp instanceof Date 
          ? item.timestamp.toISOString() 
          : item.timestamp,
      })),
      createdAt: obj.createdAt instanceof Date 
        ? obj.createdAt.toISOString() 
        : obj.createdAt,
      updatedAt: obj.updatedAt instanceof Date 
        ? obj.updatedAt.toISOString() 
        : obj.updatedAt,
    };
  }

  /**
   * Find document by ID
   */
  async findById(id: string) {
    try {
      const document = await this.model.findById(id);
      if (!document) {
        return null;
      }
      return this.formatDocument(document);
    } catch (error) {
      return null;
    }
  }

  /**
   * Find documents by status
   */
  async findByStatus(status: string) {
    try {
      const documents = await this.model.find({ status });
      return documents.map(doc => this.formatDocument(doc));
    } catch (error) {
      return [];
    }
  }

  /**
   * Execute business logic based on document type
   * Called when document is APPROVED
   */
  async executeBusinessLogic(
    document: HydratedDocument<DocumentEntity>,
    session: ClientSession,
  ) {
    const payload = document.payload as any;

    switch (document.type) {
      case DocumentType.EXPENSE:
        await this.processExpense(document, payload, session);
        break;

      case DocumentType.LEAVE:
        await this.processLeave(document, payload, session);
        break;

      case DocumentType.ASSET:
        await this.processAsset(document, payload, session);
        break;

      default:
        throw new BadRequestException(`Unknown document type: ${document.type}`);
    }
  }

  /**
   * Process EXPENSE document
   * Deduct amount from active budget
   */
  private async processExpense(
    document: HydratedDocument<DocumentEntity>,
    payload: ExpensePayloadDto,
    session: ClientSession,
  ) {
    const budget = await this.budgetModel
      .findOne({
        isActive: true,
        currency: payload.currency,
      })
      .session(session);

    if (!budget) {
      throw new BadRequestException(`No active budget found for ${payload.currency}`);
    }

    // Check if budget is sufficient
    const remaining = (budget.totalBudget || 0) - (budget.spentAmount || 0);
    if (remaining < payload.amount) {
      throw new BadRequestException(
        `Insufficient budget. Available: ${remaining}, Requested: ${payload.amount}`,
      );
    }

    // Deduct from budget
    budget.spentAmount = (budget.spentAmount || 0) + payload.amount;
    await budget.save({ session });
  }

  /**
   * Process LEAVE document
   * Deduct leave days from user
   */
  private async processLeave(
    document: HydratedDocument<DocumentEntity>,
    payload: LeavePayloadDto,
    session: ClientSession,
  ) {
    const user = await this.userModel.findById(document.creatorId).session(session);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if user has enough leave days
    if (user.availableLeaveDays < payload.totalDays) {
      throw new BadRequestException(
        `Insufficient leave days. Available: ${user.availableLeaveDays}, Requested: ${payload.totalDays}`,
      );
    }

    // Deduct leave days
    user.availableLeaveDays -= payload.totalDays;
    await user.save({ session });
  }

  /**
   * Process ASSET document
   * Create new asset record and assign to user
   */
  private async processAsset(
    document: HydratedDocument<DocumentEntity>,
    payload: AssetPayloadDto,
    session: ClientSession,
  ) {
    const assetDoc = new this.assetModel({
      assetTag: `AST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      assetType: payload.assetType,
      assetName: payload.assetName,
      purchasePrice: payload.estimatedCost,
      purchaseDate: new Date(),
      assignedTo: document.creatorId,
      assignedAt: new Date(),
      requestDocumentId: document._id,
      isActive: true,
      metadata: {
        quantity: payload.quantity || 1,
      },
    });

    await assetDoc.save({ session });
    if (!assetDoc._id) {
      throw new BadRequestException('Failed to create asset');
    }
  }

  /**
   * Update document
   */
  async updateDocument(
    documentId: string,
    updateData: Partial<DocumentEntity>,
  ) {
    try {
      const updated = await this.model.findByIdAndUpdate(documentId, updateData, {
        new: true,
      });
      return updated ? this.formatDocument(updated) : null;
    } catch (error) {
      throw new BadRequestException('Failed to update document');
    }
  }
}