import { Request } from 'express';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PractitionerLoginDto, PractitionerLoginLinkVerificationDto, SigninDto, VerifyMfaCodeDto } from './dto/signin';
import { VerifyOtpDto } from './dto/verifyOtp';
import { AuthGuard } from 'src/guards/authgaurd';
import { ResetPasswordDto } from './dto/resetPassword';
import { Public } from 'src/guards/authgaurd';


@Controller('auth')
// @ApiConflictResponse()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('sign-in')
  async signIn(@Body() payload: SigninDto) {
    return await this.authService.signin(payload);
  }

  @Public()
  @Post('verify-mfa-code')
  async verifyMfaCode(@Body() payload: VerifyMfaCodeDto) {
    return await this.authService.verifyMfaCode(payload);
  }

  @Public()
  @Post('practitioner-login')
  async practitionerLogin(@Body() payload: PractitionerLoginDto) {
    return await this.authService.practitionerSignIn(payload);
  }

  @Public()
  @Post('practitioner-login-verification')
  async practitionerLoginVerification(@Body() payload: PractitionerLoginLinkVerificationDto) {
    return await this.authService.practitionerLoginVerification(payload);
  }

  // @Post('forgot-password')
  // async forgotPassword(@Body() payload: ForgotPasswordDto) {
  //   return await this.authService.forgotPassword(payload);
  // }

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
