import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for submitting document
 * PATCH /document/:id/submit
 */
export class SubmitDocumentDto {
  @ApiProperty({
    description: 'Optional comment for document submission',
    example: 'Please review this document',
    required: false,
  })
  @IsOptional()
  @IsString()
  comment?: string;
}

/**
 * DTO for approving/rejecting document
 * PATCH /document/:id/approve
 */
export class HandleApprovalDto {
  @ApiProperty({
    description: 'Action to perform on document',
    enum: ['approve', 'reject'],
    example: 'approve',
  })
  @IsNotEmpty()
  @IsEnum(['approve', 'reject'], {
    message: 'action must be either "approve" or "reject"',
  })
  action: 'approve' | 'reject';

  @ApiProperty({
    description: 'Optional comment for history',
    example: 'Good work, approved!',
    required: false,
  })
  @IsOptional()
  @IsString()
  comment?: string;
}

/**
 * Response DTO for document operations
 */
export class DocumentResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Document submitted for review' })
  message: string;

  @ApiProperty({
    type: 'object',
    properties: {
      _id: { type: 'string' },
      status: { type: 'string' },
      currentStep: { type: 'number' },
    },
  })
  data: any;
}

/**
 * Document history item DTO
 */
export class DocumentHistoryItemDto {
  @ApiProperty({ description: 'User ID who performed action' })
  userId: string;

  @ApiProperty({ description: 'Action performed (SUBMIT, APPROVE, REJECT, etc)' })
  action: string;

  @ApiProperty({ description: 'Comment left by user' })
  comment?: string;

  @ApiProperty({ description: 'Timestamp of action' })
  timestamp: Date;
}

/**
 * Document summary DTO
 */
export class DocumentSummaryDto {
  @ApiProperty({ description: 'Document ID' })
  _id: string;

  @ApiProperty({ description: 'Document serial number' })
  serialNumber: string;

  @ApiProperty({ description: 'Document type (EXPENSE, LEAVE, ASSET)' })
  type: string;

  @ApiProperty({ description: 'Document status' })
  status: string;

  @ApiProperty({ description: 'Current approval step' })
  currentStep: number;

  @ApiProperty({ description: 'Creator user ID' })
  creatorId: string;

  @ApiProperty({ description: 'Document creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Document last update date' })
  updatedAt: Date;
}