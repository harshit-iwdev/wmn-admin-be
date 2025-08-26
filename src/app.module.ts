import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TaskScheduleModule } from './task-schedule/task-schedule.module';
import { PractitionerModule } from './practitioner/practitioner.module';


@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    TaskScheduleModule,
    PractitionerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
