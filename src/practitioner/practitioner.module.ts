import { Module } from '@nestjs/common';
import { PractitionerController } from './practitioner.controller';
import { PractitionerService } from './practitioner.service';
import { User } from 'src/models';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  controllers: [PractitionerController],
  providers: [PractitionerService]
})
export class PractitionerModule {}
