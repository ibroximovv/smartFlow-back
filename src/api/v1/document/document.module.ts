import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentEntity, DocumentSchema } from '@common/schema/document.schema';
import { User, UserSchema } from '@common/schema/user.schema';
import { Budget, BudgetSchema } from '@common/schema/budget.schema';
import { Asset, AssetSchema } from '@common/schema/asset.schema';
import { Workflow, WorkflowSchema } from '@common/schema/workflow.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: DocumentEntity.name, schema: DocumentSchema },
    { name: User.name, schema: UserSchema },
    { name: Budget.name, schema: BudgetSchema },
    { name: Asset.name, schema: AssetSchema },
    { name: Workflow.name, schema: WorkflowSchema }
  ])],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class DocumentModule { }
