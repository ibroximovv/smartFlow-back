import { AssetType, Currency, Department, DocumentAction, DocumentStatus, DocumentType, LeaveType } from "@common/constants";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type DocumentDocument = DocumentEntity & Document

class ExpensePayload {
    @Prop({ required: true })
    amount: number

    @Prop({ type: String, enum: Currency, default: Currency.UZS })
    currency: Currency

    @Prop({ type: String, required: true })
    reason: string

    @Prop({ type: String, enum: Department })
    department?: Department
}

class LeavePayload {
    @Prop({ type: String, enum: LeaveType, required: true })
    leaveType: LeaveType;

    @Prop({ required: true, type: Date })
    startDate: Date;

    @Prop({ required: true, type: Date })
    endDate: Date;

    @Prop({ required: true })
    totalDays: number;

    @Prop()
    reason?: string;

    @Prop()
    coveringPerson?: string;
}

class AssetPayload {
    @Prop({ type: String, enum: AssetType, required: true })
    assetType: AssetType;

    @Prop({ required: true })
    assetName: string;

    @Prop()
    estimatedCost?: number;

    @Prop()
    justification: string;

    @Prop()
    quantity?: number;
}

class HistoryEntry {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId

    @Prop({ type: String, enum: DocumentAction, required: true })
    action: DocumentAction

    @Prop({ type: String, required: false })
    comment?: string

    @Prop({ required: true, type: Date, default: Date.now })
    timestamp: Date;
}

@Schema({ timestamps: true, collection: 'documents' })
export class DocumentEntity {
    @Prop({ required: true, unique: true })
    serialNumber: string

    @Prop({ type: String, enum: DocumentType, required: true })
    type: DocumentType

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    creatorId: string;

    @Prop({ default: 0 })
    currentStep: number;

    @Prop({ type: String, enum: DocumentStatus, default: DocumentStatus.DRAFT })
    status: DocumentStatus;

    @Prop({ type: MongooseSchema.Types.Mixed, required: true, default: ExpensePayload })
    payload: ExpensePayload | LeavePayload | AssetPayload;

    @Prop({ type: [HistoryEntry], default: [] })
    history: HistoryEntry[];

    @Prop()
    pdfUrl?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    currentAssigneeId?: MongooseSchema.Types.ObjectId;

    @Prop()
    rejectionReason?: string;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentEntity);

DocumentSchema.index({ serialNumber: 1 });
DocumentSchema.index({ type: 1, status: 1 });
DocumentSchema.index({ creatorId: 1 });
DocumentSchema.index({ currentAssigneeId: 1 });
DocumentSchema.index({ status: 1, createdAt: -1 });
DocumentSchema.index({ 'history.userId': 1 });