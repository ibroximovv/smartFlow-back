import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Workflow, WorkflowSchema } from '@common/schema/workflow.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Workflow.name, schema: WorkflowSchema }])],
  controllers: [WorkflowController],
  providers: [WorkflowService],
})
export class WorkflowModule { }
