import { UserRole } from "@common/constants"
import { SetMetadata } from "@nestjs/common"

export const ROLES_KEY = 'roles'
export const RolesDecorator = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles)