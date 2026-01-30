import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards, Query } from '@nestjs/common';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { RequestWithUser } from '@common/types';
import { AuthGuard } from '@common/guards/auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { GetDocumentDto } from './dto/get-document.dto';

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post()
  create(@Body() createDocumentDto: CreateDocumentDto, @Req() req: RequestWithUser) {
    return this.documentService.createNewDocument(req, createDocumentDto);
  }

  @Get()
  findAll(@Query() query: GetDocumentDto) {
    return this.documentService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDocumentDto: UpdateDocumentDto) {
    return this.documentService.update(id, updateDocumentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentService.delete(id);
  }
}
