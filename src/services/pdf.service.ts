import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { DocumentEntity } from '@common/schema/document.schema';
import { HydratedDocument } from 'mongoose';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly storagePath = path.join(process.cwd(), 'generated-pdfs');

  constructor() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  generateHtmlTemplate(document: HydratedDocument<DocumentEntity>, approvers: any[]): string {
    const approversList = approvers
      .map(
        (approver) =>
          `<tr>
        <td>${approver.fullName}</td>
        <td>${approver.role}</td>
        <td>${approver.approvalDate || 'N/A'}</td>
      </tr>`,
      )
      .join('');

    const payload = document.payload as any;
    let documentDetails = '';

    switch (document.type) {
      case 'EXPENSE':
        documentDetails = `
          <h3>Expense Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td><strong>Amount:</strong></td><td>${payload.amount} ${payload.currency}</td></tr>
            <tr><td><strong>Reason:</strong></td><td>${payload.reason}</td></tr>
            <tr><td><strong>Department:</strong></td><td>${payload.department || 'N/A'}</td></tr>
          </table>
        `;
        break;

      case 'LEAVE':
        const startDate = new Date(payload.startDate).toLocaleDateString();
        const endDate = new Date(payload.endDate).toLocaleDateString();
        documentDetails = `
          <h3>Leave Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td><strong>Leave Type:</strong></td><td>${payload.leaveType}</td></tr>
            <tr><td><strong>Start Date:</strong></td><td>${startDate}</td></tr>
            <tr><td><strong>End Date:</strong></td><td>${endDate}</td></tr>
            <tr><td><strong>Total Days:</strong></td><td>${payload.totalDays}</td></tr>
            <tr><td><strong>Reason:</strong></td><td>${payload.reason || 'N/A'}</td></tr>
          </table>
        `;
        break;

      case 'ASSET':
        documentDetails = `
          <h3>Asset Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td><strong>Asset Type:</strong></td><td>${payload.assetType}</td></tr>
            <tr><td><strong>Asset Name:</strong></td><td>${payload.assetName}</td></tr>
            <tr><td><strong>Estimated Cost:</strong></td><td>${payload.estimatedCost || 'N/A'}</td></tr>
            <tr><td><strong>Quantity:</strong></td><td>${payload.quantity || 1}</td></tr>
            <tr><td><strong>Justification:</strong></td><td>${payload.justification}</td></tr>
          </table>
        `;
        break;
    }

    const qrCode = `QR-${document._id}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          h3 { color: #666; margin-top: 20px; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .header { background-color: #007bff; color: white; padding: 20px; }
          .document-number { font-size: 18px; font-weight: bold; }
          .status { color: #28a745; font-weight: bold; }
          .qr-code { margin-top: 20px; padding: 10px; background-color: #f5f5f5; text-align: center; }
          .approvers { margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="document-number">Document: ${document.serialNumber}</div>
          <div>Type: ${document.type}</div>
          <div class="status">Status: APPROVED</div>
        </div>

        ${documentDetails}

        <div class="approvers">
          <h3>Approval History</h3>
          <table>
            <tr>
              <th>Approver Name</th>
              <th>Role</th>
              <th>Approval Date</th>
            </tr>
            ${approversList}
          </table>
        </div>

        <div class="qr-code">
          <p><strong>Document QR Code:</strong> ${qrCode}</p>
          <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
  }

  async savePdfFile(content: Buffer, fileName: string): Promise<string> {
    const filePath = path.join(this.storagePath, fileName);
    try {
      fs.writeFileSync(filePath, content);
      this.logger.log(`PDF saved: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error(`Failed to save PDF: ${error.message}`);
      throw error;
    }
  }

  getPdfUrl(fileName: string): string {
    // This should be your actual storage URL (cloud storage, local server, etc.)
    return `/api/documents/download/${fileName}`;
  }

  extractApprovers(document: HydratedDocument<DocumentEntity>): any[] {
    return document.history
      .filter((h) => h.action === 'APPROVE')
      .map((h) => ({
        userId: h.userId,
        approvalDate: h.timestamp.toLocaleString(),
      }));
  }

  async generatePdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    // Convert Uint8Array to Buffer
    return Buffer.from(pdfBuffer);
  }
}
