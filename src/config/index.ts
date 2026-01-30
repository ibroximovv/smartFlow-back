import { Logger } from "@nestjs/common"
import * as dotenv from 'dotenv'

dotenv.config()

export type ConfigType = {
    API_PORT: number
    DATABASE_URL: string
    JWT_SECRET: string
    JWT_EXPIRED_TIME: string
    NODE_ENV: 'development' | 'production'
    FRONTEND_URL: string
    SUPERADMIN_EMAIL: string
    SUPERADMIN_PASSWORD: string
    VERSION: 'v1' | 'v2'
    MONGODB_URI: string
}

const requiredVariables = [
    'API_PORT',
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_EXPIRED_TIME',
    'NODE_ENV',
    'FRONTEND_URL',
    'SUPERADMIN_EMAIL',
    'SUPERADMIN_PASSWORD',
    'VERSION',
    'MONGODB_URI'
]

const missingVariables = requiredVariables.filter((variable) => {
    const value = process.env[variable]
    return !value || value.trim() === ''
})

if (missingVariables.length > 0) {
    Logger.error(`Missing required enivornment variables: ${missingVariables.join(', ')}`)
    process.exit(1)
}

export const config: ConfigType = {
    API_PORT: parseInt(process.env.API_PORT as string, 10),
    DATABASE_URL: process.env.DATABASE_URL as string,
    JWT_SECRET: process.env.JWT_SECRET as string,
    JWT_EXPIRED_TIME: process.env.JWT_EXPIRED_TIME as string,
    NODE_ENV: process.env.NODE_ENV as 'development' | 'production',
    FRONTEND_URL: process.env.FRONTEND_URL as string,
    SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL as string,
    SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD as string,
    VERSION: process.env.VERSION as 'v1' | 'v2',
    MONGODB_URI: process.env.MONGODB_URI as string
}