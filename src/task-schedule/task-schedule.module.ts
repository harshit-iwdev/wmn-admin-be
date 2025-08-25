import { Module } from '@nestjs/common';
import { TaskScheduleController } from './task-schedule.controller';
import { TaskScheduleService } from './task-schedule.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/models';


@Module({
  imports: [SequelizeModule.forFeature([User])],
  controllers: [TaskScheduleController],
  providers: [TaskScheduleService]
})
export class TaskScheduleModule {}
