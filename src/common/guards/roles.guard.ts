import { ROLES_KEY } from '@common/decorators/roles.decorator';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }
    canActivate(
        context: ExecutionContext,
    ): boolean {
        const requiredRoles = this.reflector.getAllAndOverride(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ])

        if (!requiredRoles.length) {
            return true;
        }

        const request = context.switchToHttp().getRequest()
        return requiredRoles.includes(request['user'].role)
    }
}