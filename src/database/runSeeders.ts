import { config } from '@config/index';
import mongoose from 'mongoose';
import adminseeder from './seeders/admin.seeder'
import { Logger } from '@nestjs/common';

export async function runSeeder() {
    try {
        await mongoose.connect(config.DATABASE_URL);
        Logger.log('DB connected!')

        await adminseeder.seedAdmin()

        Logger.log('Seeder finished')
    } catch (e: any) {
        Logger.error('Seeder runner error:', e.message)
    }
}