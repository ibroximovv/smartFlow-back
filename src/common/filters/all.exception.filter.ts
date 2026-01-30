import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WsException } from '@nestjs/websockets';

interface ErrorResponse {
    success: boolean;
    statusCode: number;
    message: string | string[];
    error?: string;
    path?: string;
    method?: string;
    timestamp: string;
    traceId?: string;
}

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('ExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost) {
        const type = host.getType<'http' | 'ws' | 'rpc'>();

        switch (type) {
            case 'http':
                return this.handleHttpException(exception, host);
            case 'ws':
                return this.handleWsException(exception, host);
            case 'rpc':
                return this.handleRpcException(exception, host);
            default:
                this.logger.error('Unknown exception type:', exception);
        }
    }

    // http
    private handleHttpException(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const traceId = this.generateTraceId();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: string | string[] = 'Internal server error';
        let errorType = 'INTERNAL_ERROR';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res: any = exception.getResponse();

            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object' && res.message) {
                message = res.message;
                errorType = res.error || errorType;
            }
        }
        else if ((exception as any)?.code === 11000) {
            status = HttpStatus.CONFLICT;
            const fields = Object.keys((exception as any).keyValue || {});
            message = `Duplicate value for: ${fields.join(', ')}`;
            errorType = 'DUPLICATE_ERROR';
        }
        else if ((exception as any)?.name === 'ValidationError') {
            status = HttpStatus.BAD_REQUEST;
            const errors = (exception as any).errors;
            message = Object.values(errors)
                .map((e: any) => e.message)
                .flat();
            errorType = 'VALIDATION_ERROR';
        }
        else if ((exception as any)?.name === 'CastError') {
            status = HttpStatus.BAD_REQUEST;
            message = 'Invalid ID format';
            errorType = 'INVALID_ID';
        }
        else if (Array.isArray((exception as any)?.message)) {
            status = HttpStatus.BAD_REQUEST;
            message = (exception as any).message;
            errorType = 'VALIDATION_ERROR';
        }
        else if (exception instanceof Error) {
            message = exception.message;
            this.logger.error('Unhandled error:', exception);
        }
        else {
            this.logger.error('Unknown error type:', exception);
        }

        const errorResponse: ErrorResponse = {
            success: false,
            statusCode: status,
            message,
            error: errorType,
            path: request.url,
            method: request.method,
            timestamp: new Date().toISOString(),
            traceId,
        };

        if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
            this.logger.error(`[${traceId}] ${status} - ${JSON.stringify(errorResponse)}`);
        } else {
            this.logger.warn(`[${traceId}] ${status} - ${message}`);
        }

        return response.status(status).json(errorResponse);
    }

    // ws
    private handleWsException(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToWs();
        const client = ctx.getClient();
        const data = ctx.getData();
        const traceId = this.generateTraceId();

        let message: any = 'Socket error';
        let code = 'WS_ERROR';

        if (exception instanceof WsException) {
            message = exception.getError();
            code = 'WS_EXCEPTION';
        } else if (exception instanceof HttpException) {
            message = exception.getResponse();
            code = 'HTTP_EXCEPTION_IN_WS';
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        this.logger.error(`[${traceId}] WebSocket error:`, exception);

        client.emit('exception', {
            success: false,
            code,
            message,
            data,
            timestamp: new Date().toISOString(),
            traceId,
        });
    }

    // rcp
    private handleRpcException(exception: unknown, host: ArgumentsHost) {
        const traceId = this.generateTraceId();
        this.logger.error(`[${traceId}] RPC Exception:`, exception);

        try {
            const ctx = host.getArgByIndex(0);

            if (ctx && typeof ctx.reply === 'function') {
                ctx.reply('Error! Please try again.');
            }
        } catch (err) {
            this.logger.error(`[${traceId}] Failed to handle RPC exception:`, err);
        }
    }

    // helper
    private generateTraceId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}