import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentEntity, DocumentSchema } from '@common/schema/document.schema';
import { User, UserSchema } from '@common/schema/user.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: DocumentEntity.name, schema: DocumentSchema }, { name: User.name, schema: UserSchema}])],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class DocumentModule { }
