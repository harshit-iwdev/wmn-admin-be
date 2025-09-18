import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup';
import { CommonHelperService } from 'src/common/commonService';

describe('AuthController', () => {
  let authController: AuthController;

  const payload: SignupDto = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'example.@gmail.com',
    password: 'password123',
  };

  const mockSignUpResponse = {
    statusCode: 201,
    message: 'User created successfully',
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [AuthService, CommonHelperService],
    }).compile();

    authController = app.get<AuthController>(AuthController);
  });

});
