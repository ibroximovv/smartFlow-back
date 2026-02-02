import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentEntity } from '@common/schema/document.schema';
import { HydratedDocument, Model, ClientSession } from 'mongoose';
import { RequestWithUser } from '@common/types';
import { DocumentAction, DocumentStatus, UserRole } from '@common/constants';
import { User } from '@common/schema/user.schema';
import { Workflow } from '@common/schema/workflow.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentGateway } from 'src/gateways/document.gateway';

export interface ApprovalPayloadDto {
  action: 'approve' | 'reject';
  comment?: string;
}

/**
 * Helper function to format document response
 * Convert all IDs to strings, timestamps to ISO format
 */
function formatDocument(doc: HydratedDocument<DocumentEntity>) {
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

@Injectable()
export class ApprovalService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private documentModel: Model<HydratedDocument<DocumentEntity>>,
    @InjectModel(User.name) private userModel: Model<HydratedDocument<User>>,
    @InjectModel(Workflow.name)
    private workflowModel: Model<HydratedDocument<Workflow>>,
    @InjectQueue('pdf-queue') private pdfQueue: Queue,
    private readonly documentGateway: DocumentGateway,
  ) {}

  /**
   * Check if user has reviewer role
   */
  private async checkReviewRole(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const reviewRoles = [UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    return reviewRoles.includes(user.role);
  }

  /**
   * Check if user has approver role
   */
  private async checkApprovalRole(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const approvalRoles = [UserRole.APPROVER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    return approvalRoles.includes(user.role);
  }

  /**
   * Submit document for review
   * DRAFT → IN_REVIEW
   */
  async submitForReview(
    req: RequestWithUser,
    documentId: string,
    data: { comment?: string },
  ) {
    const session = await this.documentModel.db.startSession();
    session.startTransaction();

    try {
      const hasReviewRole = await this.checkReviewRole(req['user'].id);
      if (!hasReviewRole) {
        throw new ForbiddenException(
          'Only REVIEWER, ADMIN, or SUPER_ADMIN can submit documents for review',
        );
      }

      const document = await this.documentModel
        .findById(documentId)
        .session(session);
      if (!document) {
        throw new BadRequestException('Document not found');
      }

      if (document.creatorId.toString() !== req['user'].id) {
        throw new ForbiddenException('Only the creator can submit this document');
      }

      if (document.status !== DocumentStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot submit document in ${document.status} status. Must be DRAFT.`,
        );
      }

      const creator = await this.userModel
        .findById(req['user'].id)
        .session(session);
      if (!creator) {
        throw new BadRequestException('Creator not found');
      }

      const workflow = await this.workflowModel
        .findOne({
          documentType: document.type,
          isActive: true,
        })
        .session(session);

      if (!workflow || workflow.steps.length === 0) {
        throw new BadRequestException(
          `No active workflow found for ${document.type}`,
        );
      }

      document.status = DocumentStatus.IN_REVIEW;
      document.currentStep = 0;
      document.history.push({
        userId: creator._id,
        comment: data.comment,
        action: DocumentAction.SUBMIT,
        timestamp: new Date(),
      });

      await document.save({ session });
      await session.commitTransaction();

      this.documentGateway.notifyDocumentStatusChange(
        document._id.toString(),
        document.status,
        {
          currentStep: document.currentStep,
          comment: data.comment,
          actorId: creator._id.toString(),
        },
      );

      return {
        statusCode: 200,
        message: 'Document submitted for review',
        data: formatDocument(document),
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
        error.message || 'Failed to submit document for review',
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Approve or reject document
   */
  async handleApproval(
    req: RequestWithUser,
    documentId: string,
    payload: ApprovalPayloadDto,
  ) {
    const { action, comment } = payload;

    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestException('Invalid action. Must be "approve" or "reject"');
    }

    const document = await this.documentModel.findById(documentId);
    if (!document) {
      throw new BadRequestException('Document not found');
    }

    if (action === 'approve') {
      if (document.status === DocumentStatus.IN_REVIEW) {
        return this.reviewerApprove(req, document, comment);
      } else if (document.status === DocumentStatus.WAITING_APPROVAL) {
        return this.approverApprove(req, document, comment);
      } else {
        throw new BadRequestException(
          `Cannot approve document in ${document.status} status`,
        );
      }
    } else if (action === 'reject') {
      if (
        ![DocumentStatus.IN_REVIEW, DocumentStatus.WAITING_APPROVAL].includes(
          document.status,
        )
      ) {
        throw new BadRequestException(
          `Cannot reject document in ${document.status} status`,
        );
      }
      return this.rejectDocument(req, document, comment);
    }
  }

  /**
   * Reviewer approves document in IN_REVIEW status
   */
  private async reviewerApprove(
    req: RequestWithUser,
    document: HydratedDocument<DocumentEntity>,
    comment?: string,
  ) {
    const session = await this.documentModel.db.startSession();
    session.startTransaction();

    try {
      const hasReviewRole = await this.checkReviewRole(req['user'].id);
      if (!hasReviewRole) {
        throw new ForbiddenException(
          'Only REVIEWER, ADMIN, or SUPER_ADMIN can approve in IN_REVIEW status',
        );
      }

      const reviewer = await this.userModel
        .findById(req['user'].id)
        .session(session);
      if (!reviewer) {
        throw new BadRequestException('User not found');
      }

      const freshDoc = await this.documentModel
        .findById(document._id)
        .session(session);
      if (!freshDoc || freshDoc.status !== DocumentStatus.IN_REVIEW) {
        throw new BadRequestException(
          'Document is no longer in IN_REVIEW status',
        );
      }

      const workflow = await this.workflowModel
        .findOne({
          documentType: freshDoc.type,
          isActive: true,
        })
        .session(session);

      if (!workflow) {
        throw new BadRequestException(
          `No workflow found for ${freshDoc.type}`,
        );
      }

      const nextStepIndex = freshDoc.currentStep + 1;
      const isLastStep = nextStepIndex >= workflow.steps.length;

      if (isLastStep) {
        freshDoc.status = DocumentStatus.WAITING_APPROVAL;
      } else {
        freshDoc.currentStep = nextStepIndex;
      }

      freshDoc.history.push({
        userId: reviewer._id,
        comment,
        action: DocumentAction.APPROVE,
        timestamp: new Date(),
      });

      await freshDoc.save({ session });
      await session.commitTransaction();

      this.documentGateway.notifyDocumentStatusChange(
        freshDoc._id.toString(),
        freshDoc.status,
        {
          currentStep: freshDoc.currentStep,
          comment,
          actorId: reviewer._id.toString(),
        },
      );

      return {
        statusCode: 200,
        message: isLastStep
          ? 'Document approved by reviewer, awaiting final approval'
          : 'Document approved by reviewer, moved to next step',
        data: formatDocument(freshDoc),
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
        error.message || 'Failed to approve document',
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Approver gives final approval in WAITING_APPROVAL status
   */
  private async approverApprove(
    req: RequestWithUser,
    document: HydratedDocument<DocumentEntity>,
    comment?: string,
  ) {
    const session = await this.documentModel.db.startSession();
    session.startTransaction();

    try {
      const hasApprovalRole = await this.checkApprovalRole(req['user'].id);
      if (!hasApprovalRole) {
        throw new ForbiddenException(
          'Only APPROVER, ADMIN, or SUPER_ADMIN can give final approval',
        );
      }

      const approver = await this.userModel
        .findById(req['user'].id)
        .session(session);
      if (!approver) {
        throw new BadRequestException('Approver not found');
      }

      const freshDoc = await this.documentModel
        .findById(document._id)
        .session(session);
      if (!freshDoc || freshDoc.status !== DocumentStatus.WAITING_APPROVAL) {
        throw new BadRequestException(
          'Document is no longer in WAITING_APPROVAL status',
        );
      }

      // Execute business logic (placeholder - implement in DocumentService)
      // await this.executeDocumentBusinessLogic(freshDoc, session);

      freshDoc.status = DocumentStatus.APPROVED;
      freshDoc.history.push({
        userId: approver._id,
        comment,
        action: DocumentAction.APPROVE,
        timestamp: new Date(),
      });

      await freshDoc.save({ session });
      await session.commitTransaction();

      this.documentGateway.notifyDocumentStatusChange(
        freshDoc._id.toString(),
        freshDoc.status,
        {
          currentStep: freshDoc.currentStep,
          comment,
          actorId: approver._id.toString(),
        },
      );

      await this.pdfQueue.add('generate-pdf', {
        documentId: freshDoc._id.toString(),
      });

      return {
        statusCode: 200,
        message: 'Document approved successfully',
        data: formatDocument(freshDoc),
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
        error.message || 'Failed to approve document',
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Reject document (returns to DRAFT)
   */
  private async rejectDocument(
    req: RequestWithUser,
    document: HydratedDocument<DocumentEntity>,
    comment?: string,
  ) {
    const session = await this.documentModel.db.startSession();
    session.startTransaction();

    try {
      if (document.status === DocumentStatus.IN_REVIEW) {
        const hasReviewRole = await this.checkReviewRole(req['user'].id);
        if (!hasReviewRole) {
          throw new ForbiddenException(
            'Only REVIEWER, ADMIN, or SUPER_ADMIN can reject in IN_REVIEW status',
          );
        }
      } else if (document.status === DocumentStatus.WAITING_APPROVAL) {
        const hasApprovalRole = await this.checkApprovalRole(req['user'].id);
        if (!hasApprovalRole) {
          throw new ForbiddenException(
            'Only APPROVER, ADMIN, or SUPER_ADMIN can reject in WAITING_APPROVAL status',
          );
        }
      }

      const rejector = await this.userModel
        .findById(req['user'].id)
        .session(session);
      if (!rejector) {
        throw new BadRequestException('User not found');
      }

      const freshDoc = await this.documentModel
        .findById(document._id)
        .session(session);
      if (!freshDoc) {
        throw new BadRequestException('Document not found');
      }

      freshDoc.status = DocumentStatus.DRAFT;
      freshDoc.currentStep = 0;
      freshDoc.rejectionReason = comment;
      freshDoc.history.push({
        userId: rejector._id,
        comment,
        action: DocumentAction.REJECT,
        timestamp: new Date(),
      });

      await freshDoc.save({ session });
      await session.commitTransaction();

      this.documentGateway.notifyDocumentStatusChange(
        freshDoc._id.toString(),
        freshDoc.status,
        {
          rejectionReason: freshDoc.rejectionReason,
          actorId: rejector._id.toString(),
        },
      );

      return {
        statusCode: 200,
        message: 'Document rejected and returned to DRAFT',
        data: formatDocument(freshDoc),
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
        error.message || 'Failed to reject document',
      );
    } finally {
      session.endSession();
    }
  }
}