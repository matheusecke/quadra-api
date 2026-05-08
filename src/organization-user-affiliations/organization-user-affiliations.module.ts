import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationUserAffiliationsService } from './organization-user-affiliations.service';
import { OrganizationUserAffiliationsController } from './organization-user-affiliations.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationUserAffiliationsController],
  providers: [OrganizationUserAffiliationsService],
  exports: [OrganizationUserAffiliationsService],
})
export class OrganizationUserAffiliationsModule {}
