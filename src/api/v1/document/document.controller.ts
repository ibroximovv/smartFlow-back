import {
  Controller,
  Patch,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  BadRequestException,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { ApprovalService, ApprovalPayloadDto } from './approval.service';
import { CreateDocumentDto } from './dto/create-document.dto';

import { RequestWithUser } from '@common/types';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@common/guards/auth.guard';
import { GetDocumentDto } from './dto/get-document.dto';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('document')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly approvalService: ApprovalService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new document' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid payload' })
  async createDocument(
    @Request() req: RequestWithUser,
    @Body() createDocumentDto: CreateDocumentDto,
  ) {
    return this.documentService.createNewDocument(req, createDocumentDto);
  }

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Get all documents' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async getAllDocuments(@Query() query: GetDocumentDto) {
    return this.documentService.get(query);
  }

  @Get(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocument(@Param('id') id: string) {
    const document = await this.documentService.findById(id);
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return {
      statusCode: 200,
      message: 'Success',
      data: document,
    };
  }

  @Patch(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit document for review (DRAFT → IN_REVIEW)',
    description:
      'Only the creator can submit. Creator must have REVIEWER, ADMIN, or SUPERADMIN role.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        comment: { type: 'string', example: 'Please review this document' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Document submitted successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid role or not creator' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async submitDocument(
    @Request() req: RequestWithUser,
    @Param('id') documentId: string,
    @Body() body: { comment?: string },
  ) {
    return this.approvalService.submitForReview(req, documentId, {
      comment: body.comment,
    });
  }

  @Patch(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve or reject document',
    description: `
    Handle document approval/rejection based on status:
    
    IN_REVIEW (Reviewer):
    - Approve: Move to next review step or WAITING_APPROVAL if last step
    - Reject: Return to DRAFT
    
    WAITING_APPROVAL (Approver):
    - Approve: Move to APPROVED (execute business logic)
    - Reject: Return to DRAFT
    `,
  })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['approve', 'reject'],
          description: 'Action to perform on document',
        },
        comment: {
          type: 'string',
          description: 'Optional comment for history',
        },
      },
      required: ['action'],
    },
  })
  @ApiResponse({ status: 200, description: 'Action performed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid role for this status' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async approveDocument(
    @Request() req: RequestWithUser,
    @Param('id') documentId: string,
    @Body() payload: ApprovalPayloadDto,
  ) {
    // Validate payload
    if (!payload.action) {
      throw new BadRequestException('action field is required');
    }

    return this.approvalService.handleApproval(req, documentId, payload);
  }

  @Get(':id/history')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get document approval history' })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'History retrieved' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentHistory(@Param('id') id: string) {
    const document = await this.documentService.findById(id);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return {
      statusCode: 200,
      message: 'Success',
      data: {
        documentId: document._id,
        status: document.status,
        currentStep: document.currentStep,
        history: document.history || [],
      },
    };
  }

  @Get('status/:status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get documents by status' })
  @ApiParam({
    name: 'status',
    enum: [
      'DRAFT',
      'IN_REVIEW',
      'WAITING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'SUBMITTED',
    ],
  })
  @ApiResponse({ status: 200, description: 'Documents retrieved' })
  async getDocumentsByStatus(
    @Param('status') status: string,
    @Request() req: RequestWithUser,
  ) {
    // Only allow users to see their own documents (optional - depends on requirements)
    const documents = await this.documentService.findByStatus(status);

    return {
      statusCode: 200,
      message: 'Success',
      data: documents,
    };
  }
}