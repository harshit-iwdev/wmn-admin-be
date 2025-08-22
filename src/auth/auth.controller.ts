import { Request } from 'express';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
// import { SignupDto } from './dto/signup';
import { SigninDto } from './dto/signin';
import { ForgotPasswordDto } from './dto/forgotPassword';
import { VerifyOtpDto } from './dto/verifyOtp';
import { AuthGuard } from 'src/guards/authgaurd';
// import { ApiBearerAuth, ApiConflictResponse } from '@nestjs/swagger';
import { ResetPasswordDto } from './dto/resetPassword';
import { Public } from 'src/guards/authgaurd';


@Controller('auth')
// @ApiConflictResponse()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('sign-in')
  async signIn(@Body() payload: SigninDto) {
    console.log(payload, "---payload---22");
    return await this.authService.signin(payload);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    return await this.authService.forgotPassword(payload);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() payload: VerifyOtpDto) {
    return await this.authService.verifyOtp(payload);
  }

  @UseGuards(AuthGuard)
  @Post('reset-password')
  // @ApiBearerAuth()
  async resetPassword(@Req() req: Request, @Body() body: ResetPasswordDto) {
    return await this.authService.resetPassword(req, body);
  }
}
