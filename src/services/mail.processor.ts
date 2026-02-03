import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MailService } from '../services/mail.service';

@Processor('mail-queue') // Navbat nomi
export class MailProcessor extends WorkerHost {
    private readonly logger = new Logger(MailProcessor.name);

    constructor(private readonly mailService: MailService) {
        super();
    }

    async process(job: Job<{ email: string; subject: string; text: string; html?: string }>) {
        const { email, subject, text, html } = job.data;
        this.logger.log(`Sending email to: ${email}`);

        try {
            await this.mailService.sendSmsToMail(email, subject, text, html);
            this.logger.log(`Email successfully sent to ${email}`);
        } catch (error) {
            this.logger.error(`Failed to send email to ${email}`, error.stack);
            // BullMQ avtomatik ravishda qayta urinishi (retry) uchun xatoni qaytaramiz
            throw error;
        }
    }
}