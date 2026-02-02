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
import { DocumentService } from './document.service';

export interface ApprovalPayloadDto {
    action: 'APPROVE' | 'REJECT';
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
        pdfUrl: obj.pdfUrl || null,
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
        private readonly documentService: DocumentService,
    ) { }

    /**
     * Submit document for review
     * DRAFT → SUBMITTED
     * Hech qanday role tekshirmaydi, faqat creator ekanligini tekshiradi
     */
    async submitForReview(
        req: RequestWithUser,
        documentId: string,
        data: { comment?: string },
    ) {
        const session = await this.documentModel.db.startSession();
        session.startTransaction();

        try {
            const document = await this.documentModel
                .findById(documentId)
                .session(session);

            if (!document) {
                throw new BadRequestException('Document not found');
            }

            // Faqat creator submit qilishi mumkin
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

            // Workflow tekshirish
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

            document.status = DocumentStatus.SUBMITTED;
            document.currentStep = 0;
            document.history.push({
                userId: creator._id,
                comment: data.comment,
                action: DocumentAction.SUBMIT,
                timestamp: new Date(),
            });

            await document.save({ session });
            await session.commitTransaction();

            // WebSocket notification
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
                message: 'Document submitted successfully',
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
     * Review document - workflow steps bo'yicha
     * SUBMITTED → IN_REVIEW → WAITING_APPROVAL
     * 
     * Workflow steps bo'yicha har bir stepni tekshiradi:
     * - steps.length = 1: SUBMITTED → WAITING_APPROVAL
     * - steps.length > 1: SUBMITTED → IN_REVIEW → ... → WAITING_APPROVAL
     */
    async reviewDocument(
        req: RequestWithUser,
        documentId: string,
        data: { comment?: string },
    ) {
        const session = await this.documentModel.db.startSession();
        session.startTransaction();

        try {
            const document = await this.documentModel
                .findById(documentId)
                .session(session);

            if (!document) {
                throw new BadRequestException('Document not found');
            }

            // Faqat SUBMITTED yoki IN_REVIEW statusida review mumkin
            if (![DocumentStatus.SUBMITTED, DocumentStatus.IN_REVIEW].includes(document.status)) {
                throw new BadRequestException(
                    `Cannot review document in ${document.status} status. Must be SUBMITTED or IN_REVIEW.`,
                );
            }

            const user = await this.userModel
                .findById(req['user'].id)
                .session(session);

            if (!user) {
                throw new BadRequestException('User not found');
            }

            // Workflow olib kelish
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

            // Joriy step index ni aniqlash
            const currentStepIndex = document.status === DocumentStatus.SUBMITTED ? 0 : document.currentStep;
            const currentStep = workflow.steps[currentStepIndex];

            if (!currentStep) {
                throw new BadRequestException('Invalid workflow step');
            }

            // User role joriy step role'iga mos kelishi kerak
            if (user.role !== currentStep.role) {
                throw new ForbiddenException(
                    `Only users with ${currentStep.role} role can review at this step. Current step: ${currentStepIndex + 1}/${workflow.steps.length}`,
                );
            }

            // History ga qo'shish
            document.history.push({
                userId: user._id,
                comment: data.comment,
                action: DocumentAction.REVIEW,
                timestamp: new Date(),
            });

            // Keyingi step bormi?
            const nextStepIndex = currentStepIndex + 1;
            const hasMoreSteps = nextStepIndex < workflow.steps.length;

            if (hasMoreSteps) {
                // Yana steplar bor - IN_REVIEW holatida qoladi
                document.status = DocumentStatus.IN_REVIEW;
                document.currentStep = nextStepIndex;
            } else {
                // Hamma steplar tugadi - WAITING_APPROVAL ga o'tadi
                document.status = DocumentStatus.WAITING_APPROVAL;
                document.currentStep = workflow.steps.length;
            }

            await document.save({ session });
            await session.commitTransaction();

            // WebSocket notification
            this.documentGateway.notifyDocumentStatusChange(
                document._id.toString(),
                document.status,
                {
                    currentStep: document.currentStep,
                    totalSteps: workflow.steps.length,
                    comment: data.comment,
                    actorId: user._id.toString(),
                },
            );

            const message = hasMoreSteps
                ? `Document reviewed successfully. Step ${nextStepIndex}/${workflow.steps.length} - awaiting ${workflow.steps[nextStepIndex].role} review`
                : 'All review steps completed. Awaiting final approval from APPROVER';

            return {
                statusCode: 200,
                message,
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
                error.message || 'Failed to review document',
            );
        } finally {
            session.endSession();
        }
    }

    /**
     * Handle approval or rejection
     * WAITING_APPROVAL → APPROVED or DRAFT
     */
    async handleApproval(
        req: RequestWithUser,
        documentId: string,
        payload: ApprovalPayloadDto,
    ) {
        const { action, comment } = payload;

        // Validate action
        if (!['APPROVE', 'REJECT'].includes(action)) {
            throw new BadRequestException('Invalid action. Must be "APPROVE" or "REJECT"');
        }

        const document = await this.documentModel.findById(documentId);
        if (!document) {
            throw new BadRequestException('Document not found');
        }

        // Faqat WAITING_APPROVAL statusida approve/reject mumkin
        if (document.status !== DocumentStatus.WAITING_APPROVAL) {
            throw new BadRequestException(
                `Cannot ${action.toLowerCase()} document in ${document.status} status. Must be WAITING_APPROVAL.`,
            );
        }

        if (action === 'APPROVE') {
            return this.approveDocument(req, document, comment);
        } else {
            return this.rejectDocument(req, document, comment);
        }
    }

    /**
     * Final approval - business logic execute + PDF generate
     * WAITING_APPROVAL → APPROVED
     */
    private async approveDocument(
        req: RequestWithUser,
        document: HydratedDocument<DocumentEntity>,
        comment?: string,
    ) {
        const session = await this.documentModel.db.startSession();
        session.startTransaction();

        try {
            const user = await this.userModel
                .findById(req['user'].id)
                .session(session);

            if (!user) {
                throw new BadRequestException('User not found');
            }

            // Faqat APPROVER, ADMIN, SUPER_ADMIN
            const allowedRoles = [UserRole.APPROVER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
            if (!allowedRoles.includes(user.role)) {
                throw new ForbiddenException(
                    'Only APPROVER, ADMIN, or SUPER_ADMIN can give final approval',
                );
            }

            const freshDoc = await this.documentModel
                .findById(document._id)
                .session(session);

            if (!freshDoc || freshDoc.status !== DocumentStatus.WAITING_APPROVAL) {
                throw new BadRequestException(
                    'Document is no longer in WAITING_APPROVAL status',
                );
            }

            // Execute business logic (expense, leave, asset)
            await this.documentService.executeBusinessLogic(freshDoc, session);

            // Status ni APPROVED ga o'zgartirish
            freshDoc.status = DocumentStatus.APPROVED;
            freshDoc.history.push({
                userId: user._id,
                comment,
                action: DocumentAction.APPROVE,
                timestamp: new Date(),
            });

            await freshDoc.save({ session });
            await session.commitTransaction();

            // WebSocket notification
            this.documentGateway.notifyDocumentStatusChange(
                freshDoc._id.toString(),
                freshDoc.status,
                {
                    comment,
                    actorId: user._id.toString(),
                },
            );

            // PDF generation queue ga qo'shish
            await this.pdfQueue.add('generate-pdf', {
                documentId: freshDoc._id.toString(),
            });

            // Creator ga notification
            this.documentGateway.notifyUser(
                freshDoc.creatorId.toString(),
                'document:approved',
                {
                    documentId: freshDoc._id.toString(),
                    serialNumber: freshDoc.serialNumber,
                    approvedBy: user._id.toString(),
                    message: 'Your document has been approved. PDF generation in progress.',
                }
            );

            return {
                statusCode: 200,
                message: 'Document approved successfully. PDF generation in progress.',
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
     * Reject document
     * WAITING_APPROVAL → DRAFT
     */
    private async rejectDocument(
        req: RequestWithUser,
        document: HydratedDocument<DocumentEntity>,
        comment?: string,
    ) {
        const session = await this.documentModel.db.startSession();
        session.startTransaction();

        try {
            const user = await this.userModel
                .findById(req['user'].id)
                .session(session);

            if (!user) {
                throw new BadRequestException('User not found');
            }

            // Faqat APPROVER, ADMIN, SUPER_ADMIN
            const allowedRoles = [UserRole.APPROVER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
            if (!allowedRoles.includes(user.role)) {
                throw new ForbiddenException(
                    'Only APPROVER, ADMIN, or SUPER_ADMIN can reject at this stage',
                );
            }

            const freshDoc = await this.documentModel
                .findById(document._id)
                .session(session);

            if (!freshDoc) {
                throw new BadRequestException('Document not found');
            }

            // Status ni DRAFT ga qaytarish
            freshDoc.status = DocumentStatus.DRAFT;
            freshDoc.currentStep = 0;
            freshDoc.rejectionReason = comment;
            freshDoc.history.push({
                userId: user._id,
                comment,
                action: DocumentAction.REJECT,
                timestamp: new Date(),
            });

            await freshDoc.save({ session });
            await session.commitTransaction();

            // WebSocket notification
            this.documentGateway.notifyDocumentStatusChange(
                freshDoc._id.toString(),
                freshDoc.status,
                {
                    rejectionReason: comment,
                    actorId: user._id.toString(),
                },
            );

            // Creator ga notification
            this.documentGateway.notifyUser(
                freshDoc.creatorId.toString(),
                'document:rejected',
                {
                    documentId: freshDoc._id.toString(),
                    serialNumber: freshDoc.serialNumber,
                    rejectedBy: user._id.toString(),
                    reason: comment,
                    message: 'Your document has been rejected. Please review and resubmit.',
                }
            );

            return {
                statusCode: 200,
                message: 'Document rejected and returned to DRAFT. Creator can edit and resubmit.',
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