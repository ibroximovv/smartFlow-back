import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export class BcryptEncryption {
    static encrypt(encryptData: string) {
        try {
            return bcrypt.hashSync(encryptData, 10);
        } catch (error) {
            throw new BadRequestException(`Error on Hash: ${error.message}`)
        }
    }

    static compare(compareData: string, hashedData: string) {
        try {
            return bcrypt.compareSync(compareData, hashedData)
        } catch (error) {
            throw new BadRequestException(`Error on Hash: ${error.message}`)
        }
    }
}