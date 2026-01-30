import mongoose from 'mongoose';
import { UserSchema } from '@common/schema/user.schema';
import { config } from '@config/index';
import { BcryptEncryption } from '@common/infrastructure/bcrypt';
import { Logger } from '@nestjs/common';

const User = mongoose.model('User', UserSchema);

const seedAdmin = async () => {
    try {
        const existingUser = await User.findOne({ email: config.SUPERADMIN_EMAIL });

        if (existingUser) {
            Logger.log('Admin already exists')
            return;
        }

        await User.create({
            email: config.SUPERADMIN_EMAIL,
            password: BcryptEncryption.encrypt(config.SUPERADMIN_PASSWORD),
            role: 'ADMIN',
            fullName: 'Ilyosbek Ibroximov',
            isActive: true,
            phoneNumber: '+998990072449',
        });

        Logger.log('Admin created!')
    } catch (err) {
        Logger.error('Seeder error:', err.message)
    }
};

export default { seedAdmin }
