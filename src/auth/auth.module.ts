import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/models';
import { CommonHelperService } from 'src/common/commonService';
import { UsersService } from 'src/users/users.service';


@Module({
  imports: [SequelizeModule.forFeature([User])],
  controllers: [AuthController],
  providers: [AuthService, CommonHelperService, UsersService],
})
export class AuthModule {}
