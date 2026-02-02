import { BadRequestException, Injectable, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { BaseService } from '@common/infrastructure/baseService';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentEntity } from '@common/schema/document.schema';
import { HydratedDocument, Model, ClientSession } from 'mongoose';
import { RequestWithUser } from '@common/types';
import { AssetPayloadDto, ExpensePayloadDto, LeavePayloadDto } from './dto/payload-document.dto';
import { DocumentAction, DocumentStatus, DocumentType, UserRole } from '@common/constants';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { User } from '@common/schema/user.schema';
import { Budget } from '@common/schema/budget.schema';
import { Asset } from '@common/schema/asset.schema';
import { Workflow } from '@common/schema/workflow.schema';

@Injectable()
export class DocumentService extends BaseService<HydratedDocument<DocumentEntity>, CreateDocumentDto, UpdateDocumentDto> {
  constructor(
    @InjectModel(DocumentEntity.name) documentModel: Model<HydratedDocument<DocumentEntity>>,
    @InjectModel(User.name) private userModel: Model<HydratedDocument<User>>,
    @InjectModel(Budget.name) private budgetModel: Model<HydratedDocument<Budget>>,
    @InjectModel(Asset.name) private assetModel: Model<HydratedDocument<Asset>>,
    @InjectModel(Workflow.name) private workflowModel: Model<HydratedDocument<Workflow>>
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

      const creator = await this.userModel.findById(req['user'].id);
      if (!creator) {
        throw new BadRequestException('Creator not found!');
      }

      const document = await this.model.create({
        serialNumber: createDocumentDto.serialNumber,
        type,
        payload: validatedPayload,
        creatorId: creator._id.toString(),
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

  async getNextStep(documentType: DocumentType, currentStep: number) {
    const workflow = await this.workflowModel.findOne({
      documentType,
      isActive: true
    });

    if (!workflow) {
      throw new BadRequestException(`No active workflow found for ${documentType}`);
    }

    const nextStep = workflow.steps.find(s => s.stepOrder === currentStep + 1);
    return nextStep || null;
  }

  async getCurrentStep(documentType: DocumentType, currentStep: number) {
    const workflow = await this.workflowModel.findOne({
      documentType,
      isActive: true
    });

    if (!workflow) {
      throw new BadRequestException(`No active workflow found for ${documentType}`);
    }

    const step = workflow.steps.find(s => s.stepOrder === currentStep);
    return step || null;
  }

  async checkUserAuthorization(
    userId: string,
    documentId: string,
    requiredRole?: UserRole,
  ): Promise<boolean> {
    const document = await this.model.findById(documentId);
    if (!document) throw new BadRequestException('Document not found');

    // Creator can always modify DRAFT documents
    if (document.status === DocumentStatus.DRAFT) {
      if (document.creatorId.toString() === userId) {
        return true;
      }
    }

    // Check if user has required role for action
    if (requiredRole) {
      const user = await this.userModel.findById(userId);
      if (!user) throw new BadRequestException('User not found');
      return user.role === requiredRole;
    }

    return false;
  }

  async submitDocument(
    req: RequestWithUser,
    documentId: string,
    data: { comment?: string },
  ) {
    const session = await this.model.db.startSession();
    session.startTransaction();
    try {
      const document = await this.model.findById(documentId).session(session);
      if (!document) throw new BadRequestException('Document not found');

      // Only creator can submit DRAFT documents
      if (document.creatorId.toString() !== req['user'].id) {
        throw new ForbiddenException('Only the creator can submit this document');
      }

      if (document.status !== DocumentStatus.DRAFT) {
        throw new BadRequestException(`Cannot submit document in ${document.status} status`);
      }

      const creator = await this.userModel.findById(req['user'].id).session(session);
      if (!creator) throw new BadRequestException('Creator not found');

      // Get first workflow step
      const workflow = await this.workflowModel.findOne({
        documentType: document.type,
        isActive: true
      }).session(session);

      if (!workflow || workflow.steps.length === 0) {
        throw new BadRequestException(`No workflow found for ${document.type}`);
      }

      const firstStep = workflow.steps[0];

      document.status = DocumentStatus.SUBMITTED;
      document.currentStep = 1;
      document.history.push({
        userId: creator._id,
        comment: data.comment,
        action: DocumentAction.SUBMIT,
        timestamp: new Date(),
      });

      await document.save({ session });
      await session.commitTransaction();

      return {
        statusCode: 200,
        message: 'Document submitted successfully',
        data: {
          _id: document._id.toString(),
          status: document.status,
          currentStep: document.currentStep,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        error.message || 'Failed to submit document',
      );
    } finally {
      session.endSession();
    }
  }

  async approveForNextStep(
    req: RequestWithUser,
    documentId: string,
    data: { comment?: string },
  ) {
    const session = await this.model.db.startSession();
    session.startTransaction();
    try {
      const document = await this.model.findById(documentId).session(session);
      if (!document) throw new BadRequestException('Document not found');

      // Check if document is in IN_REVIEW status
      if (document.status !== DocumentStatus.IN_REVIEW) {
        throw new BadRequestException(
          `Document must be in IN_REVIEW status, current status: ${document.status}`,
        );
      }

      const reviewer = await this.userModel.findById(req['user'].id).session(session);
      if (!reviewer) throw new BadRequestException('User not found');

      // Get workflow to determine next step
      const workflow = await this.workflowModel.findOne({
        documentType: document.type,
        isActive: true,
      }).session(session);

      if (!workflow) {
        throw new BadRequestException(`No workflow found for ${document.type}`);
      }

      const nextStep = workflow.steps[document.currentStep]; // currentStep is 0-indexed
      const hasMoreSteps = nextStep && document.currentStep < workflow.steps.length - 1;

      // If there are more review steps, stay in IN_REVIEW, else move to WAITING_APPROVAL
      const newStatus = hasMoreSteps ? DocumentStatus.IN_REVIEW : DocumentStatus.WAITING_APPROVAL;

      document.status = newStatus;
      if (hasMoreSteps) {
        document.currentStep += 1;
      }

      document.history.push({
        userId: reviewer._id,
        comment: data.comment,
        action: DocumentAction.APPROVE,
        timestamp: new Date(),
      });

      await document.save({ session });
      await session.commitTransaction();

      return {
        statusCode: 200,
        message: 'Document approved for next step',
        data: {
          _id: document._id.toString(),
          status: document.status,
          currentStep: document.currentStep,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        error.message || 'Failed to approve document',
      );
    } finally {
      session.endSession();
    }
  }

  async finalApprove(
    req: RequestWithUser,
    documentId: string,
    data: { comment?: string },
  ) {
    const session = await this.model.db.startSession();
    session.startTransaction();
    try {
      const document = await this.model.findById(documentId).session(session);
      if (!document) throw new BadRequestException('Document not found');

      if (document.status !== DocumentStatus.WAITING_APPROVAL) {
        throw new BadRequestException(
          `Document must be in WAITING_APPROVAL status, current: ${document.status}`,
        );
      }

      const approver = await this.userModel.findById(req['user'].id).session(session);
      if (!approver) throw new BadRequestException('Approver not found');

      // Execute business logic based on document type
      await this.executeBusinessLogic(document, session);

      document.status = DocumentStatus.APPROVED;
      document.history.push({
        userId: approver._id,
        comment: data.comment,
        action: DocumentAction.APPROVE,
        timestamp: new Date(),
      });

      await document.save({ session });
      await session.commitTransaction();

      return {
        statusCode: 200,
        message: 'Document approved successfully',
        data: {
          _id: document._id.toString(),
          status: document.status,
          message: 'Business logic executed, document approved',
        },
      };
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        error.message || 'Failed to approve document',
      );
    } finally {
      session.endSession();
    }
  }

  private async executeBusinessLogic(
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
   * Process expense: Deduct from budget
   */
  private async processExpense(
    document: HydratedDocument<DocumentEntity>,
    payload: ExpensePayloadDto,
    session: ClientSession,
  ) {
    const budget = await this.budgetModel.findOne({
      isActive: true,
      currency: payload.currency,
    }).session(session);

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

  private async processLeave(
    document: HydratedDocument<DocumentEntity>,
    payload: LeavePayloadDto,
    session: ClientSession,
  ) {
    const user = await this.userModel.findById(document.creatorId).session(session);
    if (!user) throw new BadRequestException('User not found');

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

  private async processAsset(
    document: HydratedDocument<DocumentEntity>,
    payload: AssetPayloadDto,
    session: ClientSession,
  ) {
    // Create asset record
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

  async rejectDocument(
    req: RequestWithUser,
    documentId: string,
    data: { comment?: string },
  ) {
    const session = await this.model.db.startSession();
    session.startTransaction();
    try {
      const document = await this.model.findById(documentId).session(session);
      if (!document) throw new BadRequestException('Document not found');

      // Can only reject if document is IN_REVIEW or WAITING_APPROVAL
      if (
        ![DocumentStatus.IN_REVIEW, DocumentStatus.WAITING_APPROVAL].includes(
          document.status,
        )
      ) {
        throw new BadRequestException(
          `Cannot reject document in ${document.status} status`,
        );
      }

      const rejector = await this.userModel.findById(req['user'].id).session(session);
      if (!rejector) throw new BadRequestException('User not found');

      document.status = DocumentStatus.REJECTED;
      document.rejectionReason = data.comment;
      document.history.push({
        userId: rejector._id,
        comment: data.comment,
        action: DocumentAction.REJECT,
        timestamp: new Date(),
      });

      await document.save({ session });
      await session.commitTransaction();

      return {
        statusCode: 200,
        message: 'Document rejected successfully',
        data: {
          _id: document._id.toString(),
          status: document.status,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        error.message || 'Failed to reject document',
      );
    } finally {
      session.endSession();
    }
  }

  async requestChanges(
    req: RequestWithUser,
    documentId: string,
    data: { comment?: string },
  ) {
    const session = await this.model.db.startSession();
    session.startTransaction();
    try {
      const document = await this.model.findById(documentId).session(session);
      if (!document) throw new BadRequestException('Document not found');

      if (document.status !== DocumentStatus.IN_REVIEW) {
        throw new BadRequestException(
          `Cannot request changes for document in ${document.status} status`,
        );
      }

      const requester = await this.userModel.findById(req['user'].id).session(session);
      if (!requester) throw new BadRequestException('User not found');

      document.status = DocumentStatus.DRAFT;
      document.currentStep = 0;
      document.history.push({
        userId: requester._id,
        comment: data.comment,
        action: DocumentAction.REQUEST_CHANGES,
        timestamp: new Date(),
      });

      await document.save({ session });
      await session.commitTransaction();

      return {
        statusCode: 200,
        message: 'Changes requested, document returned to DRAFT',
        data: {
          _id: document._id.toString(),
          status: document.status,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        error.message || 'Failed to request changes',
      );
    } finally {
      session.endSession();
    }
  }

  async performAction(
    req: RequestWithUser,
    documentId: string,
    action: DocumentAction,
    data: { comment?: string },
  ) {
    switch (action) {
      case DocumentAction.SUBMIT:
        return this.submitDocument(req, documentId, data);

      case DocumentAction.APPROVE:
        const document = await this.model.findById(documentId);
        if (!document) throw new BadRequestException('Document not found');
        if (document.status === DocumentStatus.IN_REVIEW) {
          return this.approveForNextStep(req, documentId, data);
        } else if (document.status === DocumentStatus.WAITING_APPROVAL) {
          return this.finalApprove(req, documentId, data);
        }
        throw new BadRequestException('Cannot approve document in this status');

      case DocumentAction.REJECT:
        return this.rejectDocument(req, documentId, data);

      case DocumentAction.REQUEST_CHANGES:
        return this.requestChanges(req, documentId, data);

      default:
        throw new BadRequestException(`Unknown action: ${action}`);
    }
  }
}