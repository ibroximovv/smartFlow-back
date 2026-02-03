import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MailService {
    constructor(
        private readonly mailerService: MailerService,
        @InjectQueue('mail-queue') private mailQueue: Queue
    ) { }

    async addMailToQueue(email: string, subject: string, text: string, html?: string) {
        try {
            await this.mailQueue.add('send-email', {
                email,
                subject,
                text,
                html,
            }, {
                attempts: 3,
                backoff: 3000,
            });
            return { message: `Email queued for ${email}` };
        } catch (error) {
            throw new InternalServerErrorException('Error adding email to queue');
        }
    }

    async sendSmsToMail(email: string, subject: string, text: string, html?: string) {
        await this.mailerService.sendMail({
            to: email,
            subject,
            text,
            html
        });
    }
}