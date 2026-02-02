import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, HydratedDocument } from 'mongoose';
import { DocumentEntity } from '@common/schema/document.schema';
import { User } from '@common/schema/user.schema';
import { PdfService } from './pdf.service';
import { DocumentGateway } from 'src/gateways/document.gateway';
import { Logger } from '@nestjs/common';

@Processor('pdf-queue')
export class PdfProcessor extends WorkerHost {
    private readonly logger = new Logger(PdfProcessor.name);

    constructor(
        private readonly pdfService: PdfService,
        private readonly documentGateway: DocumentGateway,
        @InjectModel(DocumentEntity.name) private documentModel: Model<HydratedDocument<DocumentEntity>>,
        @InjectModel(User.name) private userModel: Model<HydratedDocument<User>>,
    ) {
        super();
    }

    async process(job: Job<{ documentId: string }>) {
        const { documentId } = job.data;
        this.logger.log(`Processing PDF generation for document: ${documentId}`);

        try {
            this.documentGateway.notifyDocumentObservers(
                documentId,
                'pdf:generating',
                { message: 'PDF generation started' }
            );

            const document = await this.documentModel.findById(documentId);
            if (!document) {
                throw new Error(`Document not found: ${documentId}`);
            }

            if (document.status !== 'APPROVED') {
                this.logger.warn(`Document ${documentId} is not APPROVED, skipping PDF generation`);
                return;
            }

            const approvers = await this.getApproversWithNames(document);

            const html = this.pdfService.generateHtmlTemplate(document, approvers);

            const pdfBuffer = await this.pdfService.generatePdf(html);

            const fileName = `${document.serialNumber}-${Date.now()}.pdf`;
            const filePath = await this.pdfService.savePdfFile(pdfBuffer, fileName);
            const pdfUrl = this.pdfService.getPdfUrl(fileName);

            document.pdfUrl = pdfUrl;
            await document.save();

            this.logger.log(`PDF generated and saved: ${filePath}`);
            this.logger.log(`PDF URL updated in document: ${pdfUrl}`);

            this.documentGateway.notifyDocumentObservers(
                documentId,
                'pdf:ready',
                { 
                    pdfUrl,
                    fileName,
                    message: 'PDF is ready for download',
                }
            );

            this.documentGateway.notifyUser(
                document.creatorId.toString(),
                'pdf:ready',
                {
                    documentId,
                    serialNumber: document.serialNumber,
                    pdfUrl,
                    downloadUrl: `/api/document/${documentId}/download`,
                }
            );

            this.documentGateway.notifyDocumentStatusChange(
                documentId,
                'PDF_READY',
                {
                    pdfUrl,
                    fileName,
                    message: 'PDF has been generated and is ready for download',
                }
            );

        } catch (error) {
            this.logger.error(`Failed to generate PDF for ${documentId}`, error.stack);
            
            this.documentGateway.notifyDocumentObservers(
                documentId,
                'pdf:failed',
                { 
                    error: error.message,
                    message: 'PDF generation failed',
                }
            );

            try {
                const document = await this.documentModel.findById(documentId);
                if (document) {
                    this.documentGateway.notifyUser(
                        document.creatorId.toString(),
                        'pdf:failed',
                        {
                            documentId,
                            serialNumber: document.serialNumber,
                            error: error.message,
                            message: 'PDF generation failed. Please contact support.',
                        }
                    );
                }
            } catch (notifyError) {
                this.logger.error('Failed to send failure notification', notifyError);
            }

            throw error;
        }
    }

    private async getApproversWithNames(document: HydratedDocument<DocumentEntity>) {
        const approvalHistory = document.history.filter(h => h.action === 'APPROVE');

        const userIds = [...new Set(approvalHistory.map(h => h.userId))];
        const users = await this.userModel.find({ _id: { $in: userIds } });
        const userMap = new Map(users.map(u => [u._id.toString(), u]));

        return approvalHistory.map(h => {
            const user = userMap.get(h.userId.toString());
            return {
                fullName: user ? user.fullName : 'Unknown User',
                role: user ? user.role : 'Unknown Role',
                approvalDate: h.timestamp instanceof Date 
                    ? h.timestamp.toLocaleString() 
                    : new Date(h.timestamp).toLocaleString(),
            };
        });
    }
}