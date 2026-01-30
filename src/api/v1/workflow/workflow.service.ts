import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { BaseService } from '@common/infrastructure/baseService';
import { HydratedDocument, Model } from 'mongoose';
import { Workflow } from '@common/schema/workflow.schema';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class WorkflowService extends BaseService<HydratedDocument<Workflow>, CreateWorkflowDto, UpdateWorkflowDto> {
  constructor(
    @InjectModel(Workflow.name) workflowModel: Model<HydratedDocument<Workflow>>
  ) {
    super(workflowModel);
  }

  async createWorkflow(dto: CreateWorkflowDto) {
    try {
      const exists = await this.model.exists({
        documentType: dto.documentType,
        isActive: true,
      });

      if (exists) {
        throw new BadRequestException(
          `Workflow for ${dto.documentType} already exists`,
        );
      }

      const workflow = await this.model.create(dto);

      const data = {
        id: workflow._id.toString(),
        documentType: workflow.documentType,
        steps: workflow.steps,
        isActive: workflow.isActive,
      };

      return {
        statusCode: 201,
        message: 'Success!',
        data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        error.message || 'Internal server error!',
      );
    }
  }
}