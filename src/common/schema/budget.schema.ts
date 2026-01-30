import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Department, Currency } from '@common/constants';
export type BudgetDocument = Budget & Document;

@Schema({ timestamps: true, collection: 'budgets' })
export class Budget {
    @Prop({ type: String, enum: Department, required: true, unique: true })
    department: Department;

    @Prop({ required: true })
    totalBudget: number;

    @Prop({ required: true, default: 0 })
    spentAmount: number;

    @Prop({ type: String, enum: Currency, default: Currency.UZS })
    currency: Currency;

    @Prop({ required: true })
    fiscalYear: number;

    @Prop({ default: true })
    isActive: boolean;
}

export const BudgetSchema = SchemaFactory.createForClass(Budget);

BudgetSchema.virtual('remainingBudget').get(function () {
    return this.totalBudget - this.spentAmount;
});

BudgetSchema.index({ department: 1, fiscalYear: 1 }, { unique: true });
BudgetSchema.index({ isActive: 1 });