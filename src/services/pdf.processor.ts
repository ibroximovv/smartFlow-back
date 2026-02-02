import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, HydratedDocument } from 'mongoose';
import { DocumentEntity } from '@common/schema/document.schema';
import { User } from '@common/schema/user.schema';
import { PdfService } from './pdf.service';
import { Logger } from '@nestjs/common';

@Processor('pdf-queue')
export class PdfProcessor extends WorkerHost {
    private readonly logger = new Logger(PdfProcessor.name);

    constructor(
        private readonly pdfService: PdfService,
        @InjectModel(DocumentEntity.name) private documentModel: Model<HydratedDocument<DocumentEntity>>,
        @InjectModel(User.name) private userModel: Model<HydratedDocument<User>>,
    ) {
        super();
    }

    async process(job: Job<{ documentId: string }>) {
        const { documentId } = job.data;
        this.logger.log(`Processing PDF generation for document: ${documentId}`);

        try {
            const document = await this.documentModel.findById(documentId);
            if (!document) {
                throw new Error(`Document not found: ${documentId}`);
            }

            // Populate history userIds to get names (manually to ensure flexibility)
            // Or we can just fetch users for the approvers
            const approvers = await this.getApproversWithNames(document);

            const html = this.pdfService.generateHtmlTemplate(document, approvers);
            const pdfBuffer = await this.pdfService.generatePdf(html);

            const fileName = `${document.serialNumber}-${Date.now()}.pdf`;
            const filePath = await this.pdfService.savePdfFile(pdfBuffer, fileName);
            const pdfUrl = this.pdfService.getPdfUrl(fileName);

            document.pdfUrl = pdfUrl;
            await document.save();

            this.logger.log(`PDF generated and linked: ${pdfUrl}`);
        } catch (error) {
            this.logger.error(`Failed to generate PDF for ${documentId}`, error.stack);
            throw error;
        }
    }

    private async getApproversWithNames(document: HydratedDocument<DocumentEntity>) {
        const approvalHistory = document.history.filter(h => h.action === 'APPROVE');

        // Get unique user IDs
        const userIds = [...new Set(approvalHistory.map(h => h.userId))];
        const users = await this.userModel.find({ _id: { $in: userIds } });
        const userMap = new Map(users.map(u => [u._id.toString(), u]));

        return approvalHistory.map(h => {
            const user = userMap.get(h.userId.toString());
            return {
                fullName: user ? user.fullName : 'Unknown User',
                role: user ? user.role : 'Unknown Role',
                approvalDate: h.timestamp.toLocaleString(),
            };
        });
    }
}
