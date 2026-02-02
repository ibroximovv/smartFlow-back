import { Controller, Patch, Post, Get, Body, Param, UseGuards, Request, HttpCode, BadRequestException, NotFoundException, Query, Res, StreamableFile, } from '@nestjs/common';
import { DocumentService } from './document.service';
import { ApprovalService, ApprovalPayloadDto } from './approval.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { RequestWithUser } from '@common/types';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody, } from '@nestjs/swagger';
import { AuthGuard } from '@common/guards/auth.guard';
import { GetDocumentDto } from './dto/get-document.dto';

import * as fs from 'fs';
import * as path from 'path';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('document')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly approvalService: ApprovalService,
  ) { }

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
    summary: '(DRAFT → SUBMITTED)',
    description: 'Only the document creator can submit. No role restrictions.',
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
  @ApiResponse({ status: 400, description: 'Bad request - Document must be in DRAFT status' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only creator can submit' })
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

  @Patch(':id/review')
  @HttpCode(200)
  @ApiOperation({
    summary: '(SUBMITTED → IN_REVIEW → WAITING_APPROVAL)',
    description: `
    Review document according to workflow steps:
    - User role must match current step's required role
    - If steps.length = 1: SUBMITTED → WAITING_APPROVAL
    - If steps.length > 1: SUBMITTED → IN_REVIEW → ... → WAITING_APPROVAL
    
    Each step must be reviewed by users with the specified role.
    `,
  })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        comment: { type: 'string', example: 'Reviewed and approved for next step' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Document reviewed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid status' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid role for current step' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async reviewDocument(
    @Request() req: RequestWithUser,
    @Param('id') documentId: string,
    @Body() body: { comment?: string },
  ) {
    return this.approvalService.reviewDocument(req, documentId, {
      comment: body.comment,
    });
  }

  @Patch(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: '(WAITING_APPROVAL → APPROVED or REJECTED/DRAFT)',
    description: `
    Final approval or rejection by APPROVER, ADMIN, or SUPER_ADMIN:
    
    APPROVE:
    - Execute business logic (expense/leave/asset)
    - Generate PDF
    - Status → APPROVED
    
    REJECT:
    - Status → DRAFT
    - User can edit and resubmit
    
    Only APPROVER, ADMIN, or SUPER_ADMIN roles allowed.
    `,
  })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['APPROVE', 'REJECT'],
          description: 'Action to perform on document',
          example: 'APPROVE',
        },
        comment: {
          type: 'string',
          description: 'Optional comment for history',
          example: 'All checks passed, approved',
        },
      },
      required: ['action'],
    },
  })
  @ApiResponse({ status: 200, description: 'Action performed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid action or status' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid role' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async approveDocument(
    @Request() req: RequestWithUser,
    @Param('id') documentId: string,
    @Body() payload: ApprovalPayloadDto,
  ) {
    if (!payload.action) {
      throw new BadRequestException('action field is required');
    }

    if (!['APPROVE', 'REJECT'].includes(payload.action)) {
      throw new BadRequestException('action must be "APPROVE" or "REJECT"');
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
      'SUBMITTED',
      'IN_REVIEW',
      'WAITING_APPROVAL',
      'APPROVED',
      'REJECTED',
    ],
  })
  @ApiResponse({ status: 200, description: 'Documents retrieved' })
  async getDocumentsByStatus(@Param('status') status: string) {
    const documents = await this.documentService.findByStatus(status);

    return {
      statusCode: 200,
      message: 'Success',
      data: documents,
    };
  }

  @Get(':id/download')
  @HttpCode(200)
  @ApiOperation({ summary: 'Download document PDF' })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiResponse({ status: 404, description: 'Document or PDF not found' })
  async downloadPdf(
    @Param('id') documentId: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const document = await this.documentService.findById(documentId);

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!document.pdfUrl) {
      throw new NotFoundException('PDF not yet generated for this document');
    }

    const fileName = path.basename(document.pdfUrl);
    const filePath = path.join(process.cwd(), 'generated-pdfs', fileName);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('PDF file not found on server');
    }

    const file = fs.createReadStream(filePath);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });

    return new StreamableFile(file);
  }

  @Get(':id/pdf-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get PDF URL or status' })
  @ApiParam({ name: 'id', type: String, description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'PDF URL or generation status' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getPdfUrl(@Param('id') documentId: string) {
    const document = await this.documentService.findById(documentId);

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!document.pdfUrl) {
      return {
        statusCode: 200,
        message: 'PDF generation in progress',
        data: { pdfUrl: null, status: 'PENDING' },
      };
    }

    return {
      statusCode: 200,
      message: 'PDF is ready',
      data: {
        pdfUrl: document.pdfUrl,
        status: 'READY',
      },
    };
  }
}