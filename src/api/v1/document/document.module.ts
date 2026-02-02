import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { DocumentService } from './document.service';
import { ApprovalService } from './approval.service';
import { DocumentController } from './document.controller';
import { DocumentEntity, DocumentSchema } from '@common/schema/document.schema';
import { User, UserSchema } from '@common/schema/user.schema';
import { Budget, BudgetSchema } from '@common/schema/budget.schema';
import { Asset, AssetSchema } from '@common/schema/asset.schema';
import { Workflow, WorkflowSchema } from '@common/schema/workflow.schema';
import { DocumentGateway } from 'src/gateways/document.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: User.name, schema: UserSchema },
      { name: Budget.name, schema: BudgetSchema },
      { name: Asset.name, schema: AssetSchema },
      { name: Workflow.name, schema: WorkflowSchema },
    ]),
    BullModule.registerQueue({ name: 'pdf-queue' }),
  ],
  providers: [DocumentService, ApprovalService, DocumentGateway],
  controllers: [DocumentController],
  exports: [DocumentService, ApprovalService],
})
export class DocumentModule {}