import { DocumentType, UserRole } from "@common/constants";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type WorkFlowDocument = Workflow & Document

class WorkflowStep {
    @Prop({ type: Number, required: true })
    stepOrder: number

    @Prop({ type: String, enum: UserRole, required: true })
    role: UserRole

    @Prop({ type: String, required: false })
    label: string
}

@Schema({ timestamps: true, collection: 'workflows' })
export class Workflow {
    @Prop({ type: String, enum: DocumentType, required: true, unique: true })
    documentType: DocumentType

    @Prop({ type: [WorkflowStep], required: true })
    steps: WorkflowStep[]

    @Prop({ type: Boolean, default: true })
    isActive: boolean
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow)

WorkflowSchema.index({ DocumentType: 1, isActive: 1 })