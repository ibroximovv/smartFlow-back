import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { AssetType } from '@common/constants';

export type AssetDocument = Asset & Document;

@Schema({ timestamps: true, collection: 'assets' })
export class Asset {
    @Prop({ required: true, unique: true })
    assetTag: string;

    @Prop({ type: String, enum: AssetType, required: true, })
    assetType: AssetType;

    @Prop({ required: true })
    assetName: string;

    @Prop()
    description?: string;

    @Prop()
    purchasePrice?: number;

    @Prop({ type: Date })
    purchaseDate?: Date;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    assignedTo?: MongooseSchema.Types.ObjectId;

    @Prop({ type: Date })
    assignedAt?: Date;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Document' })
    requestDocumentId?: MongooseSchema.Types.ObjectId;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Object })
    metadata?: { serialNumber?: string; manufacturer?: string; model?: string; warrantyExpiry?: Date; };
}

export const AssetSchema = SchemaFactory.createForClass(Asset);

AssetSchema.index({ assetTag: 1 });
AssetSchema.index({ assignedTo: 1 });
AssetSchema.index({ assetType: 1, isActive: 1 });