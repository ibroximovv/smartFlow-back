import { UserRole } from "@common/constants";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

export type UserDocument = User & Document

@Schema({ timestamps: true, collection: 'users' })
export class User {
    @Prop({ required: true, unique: true })
    email: string

    @Prop({ required: true })
    fullName: string

    @Prop({ required: true })
    password: string

    @Prop({ type: String, enum: UserRole, default: UserRole.REQUESTER })
    role: UserRole

    @Prop({ default: 0 })
    availableLeaveDays: number

    @Prop({ default: true })
    isActive: boolean

    @Prop({ type: String, required: false })
    phoneNumber?: String
}

export const UserSchema = SchemaFactory.createForClass(User)

UserSchema.index({ email: 1 })
UserSchema.index({ role: 1, department: 1 })
UserSchema.index({ isActive: 1 })