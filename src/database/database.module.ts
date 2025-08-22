import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { databaseConfig } from '../config/database.config';
import { User } from '../models';

@Module({
  imports: [
    SequelizeModule.forRoot({
      ...databaseConfig,
      models: [User],
    }),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {} 