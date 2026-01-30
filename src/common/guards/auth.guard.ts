import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private readonly jwt: JwtService) { }
    canActivate(
        context: ExecutionContext,
    ): boolean {
        const request: any = context.switchToHttp().getRequest()

        const token = request.headers?.authorization?.split(' ')?.[1];
        if (!token) throw new UnauthorizedException('Token not found')
        try {
            const verifyToken = this.jwt.verify(token)
            request['user'] = verifyToken
            return true
        } catch (error) {
            throw new UnauthorizedException('Token valid error')
        }
    }
}