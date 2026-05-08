import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationTeamAffiliationsService } from './organization-team-affiliations.service';
import { OrganizationTeamAffiliationsController } from './organization-team-affiliations.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationTeamAffiliationsController],
  providers: [OrganizationTeamAffiliationsService],
  exports: [OrganizationTeamAffiliationsService],
})
export class OrganizationTeamAffiliationsModule {}
