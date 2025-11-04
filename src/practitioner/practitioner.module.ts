import { Module } from '@nestjs/common';
import { PractitionerController } from './practitioner.controller';
import { PractitionerService } from './practitioner.service';
import { User } from 'src/models';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersService } from 'src/users/users.service';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  controllers: [PractitionerController],
  providers: [PractitionerService, UsersService]
})
export class PractitionerModule {}
