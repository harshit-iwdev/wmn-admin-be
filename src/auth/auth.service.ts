import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { BadRequestException, HttpStatus, NotFoundException, Req } from '@nestjs/common';
import { PractitionerLoginDto, PractitionerLoginLinkVerificationDto, SigninDto, VerifyMfaCodeDto } from './dto/signin';
import * as bcrypt from 'bcrypt';
import { RESPONSE_MESSAGES } from 'src/common/utils/responseMessages';
import { VerifyOtpDto } from './dto/verifyOtp';
import { ResetPasswordDto } from './dto/resetPassword';
import { Request } from 'express';
import { CommonHelperService } from 'src/common/commonService';
import { QueryTypes } from 'sequelize';
import { UsersService } from 'src/users/users.service';


export class AuthService {
  constructor(
    @InjectModel(User) private userModel: typeof User,
    private usersService: UsersService,
    private commonHelperService: CommonHelperService
  ) {}

  async generateMfaCode(payload: SigninDto) {
    try {
      const mfaCode = this.commonHelperService.generateRandomNumericValue();
      await this.userModel?.sequelize?.query(`UPDATE public.super_admin_mfa SET mfa_code = :mfaCode,
        mfa_expires_at = :mfaCodeExpiresAt WHERE email = :email`,
        {
          replacements: { mfaCode, mfaCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000), email: payload.email },
          type: QueryTypes.UPDATE,
          raw: true,
        }
      );
      return { setMfa: true, mfaCode };
    } catch (error) {
      console.error(error, "---error---");
      return {
        setMfa: false,
        message: error.message,
      };
    }
  }

  async signin(payload: SigninDto) {
    try {
      const { email, password } = payload;
      const users = await this.userModel?.sequelize?.query('SELECT * FROM auth.users WHERE email = :email',
        {
          replacements: { email },
          type: QueryTypes.SELECT,
          raw: true,
        }
      );
      const existingUser: any = users && users[0] ? users[0] : null;
  
      if (!existingUser) {
        throw new NotFoundException(RESPONSE_MESSAGES.USER_NOT_FOUND);
      }
      if (existingUser.disabled === true) {
        throw new BadRequestException(RESPONSE_MESSAGES.USER_NOT_VERIFIED);
      }
  
      const isCorrectPassword = await bcrypt.compare(
        password,
        existingUser.password_hash,
      );

      if (!isCorrectPassword) {
        throw new BadRequestException(RESPONSE_MESSAGES.INCORRECT_PASSWORD);
      }

      const mfaData = await this.generateMfaCode(payload);

      if (!mfaData.setMfa) {
        throw new BadRequestException(RESPONSE_MESSAGES.LOGIN_FAILURE);
      }

      await this.usersService.sendMfaCodeEmail(email as string, mfaData.mfaCode as string);

      return {
        statusCode: HttpStatus.OK,
        message: RESPONSE_MESSAGES.MFA_CODE_GENERATED,
        success: true,
        data: { setMfa: true },
      }
    } catch (error) {
      console.error(error, "---error---");
      throw new BadRequestException(error.message);
    }
  }

  async verifyMfaCode(payload: VerifyMfaCodeDto) {
    try {
      const { email, mfaCode } = payload;
      const existingMfaData: any = await this.userModel?.sequelize?.query(`SELECT mfa_code, mfa_expires_at 
        FROM public.super_admin_mfa WHERE email = :email`,
        {
          replacements: { email },
          type: QueryTypes.SELECT,
          raw: true,
        }
      );
      if (!existingMfaData) {
        throw new NotFoundException(RESPONSE_MESSAGES.MFA_CODE_NOT_FOUND);
      }
      if (existingMfaData[0].mfa_code !== mfaCode) {
        throw new BadRequestException(RESPONSE_MESSAGES.INCORRECT_MFA_CODE);
      }
      if (existingMfaData[0].mfa_expires_at < new Date()) {
        throw new BadRequestException(RESPONSE_MESSAGES.MFA_CODE_EXPIRED);
      }
      await this.userModel?.sequelize?.query(`UPDATE public.super_admin_mfa SET mfa_code = '-1-1-1',
        mfa_expires_at = :mfaTime WHERE email = :email`,
        {
          replacements: { email, mfaTime: new Date() },
          type: QueryTypes.UPDATE,
          raw: true,
        }
      );

      const users = await this.userModel?.sequelize?.query('SELECT * FROM auth.users WHERE email = :email',
        {
          replacements: { email },
          type: QueryTypes.SELECT,
          raw: true,
        }
      );
      const existingUser: any = users && users[0] ? users[0] : null;

      const jwtPayload = {
        id: existingUser.id as string,
        email: existingUser.email,
      };

      const { access_token, refresh_token } = this.commonHelperService.generateJwtToken(jwtPayload);

      existingUser['refresh_token'] = refresh_token;

      return {
        statusCode: HttpStatus.OK,
        success: true,
        message: RESPONSE_MESSAGES.USER_LOGGED_IN,
        data: {
          user: { ...existingUser },
          accessToken: access_token
        }
      };
    } catch (error) {
      console.error(error, "---error---");
      throw new BadRequestException(error.message);
    }
  }

  async practitionerSignIn(payload: PractitionerLoginDto) {
    try {
      const { email } = payload;
      const users = await this.userModel?.sequelize?.query(`SELECT U.*, M.user_type FROM auth.users AS U 
        JOIN public.metadata AS M ON U.id = M.user_id WHERE U.email = :email AND M.user_type = 'practitioner'`,
        {
          replacements: { email },
          type: QueryTypes.SELECT,
          raw: true,
        }
      );
      const existingUser: any = users && users[0] ? users[0] : null;
  
      if (!existingUser) {
        throw new NotFoundException(RESPONSE_MESSAGES.USER_NOT_FOUND);
      }
      if (existingUser.disabled === true) {
        throw new BadRequestException(RESPONSE_MESSAGES.USER_NOT_VERIFIED);
      }

      if (existingUser.user_type !== 'practitioner') {
        throw new BadRequestException(RESPONSE_MESSAGES.USER_NOT_AUTHORIZED_AS_PRACTITIONER);
      }

      if (existingUser.email_verified === false) {
        throw new BadRequestException(RESPONSE_MESSAGES.USER_NOT_VERIFIED);
      }
  
      await this.usersService.sendPractitionerLoginEmail(existingUser.display_name, email);

      return {
        statusCode: HttpStatus.OK,
        success: true,
        message: RESPONSE_MESSAGES.PRACTITIONER_LOGIN_LINK_SENT,
      };
    } catch (error) {
      console.error(error, "---error---");
      throw new BadRequestException(error.message);
    }
  }

  async practitionerLoginVerification(payload: PractitionerLoginLinkVerificationDto) {
    const { email, timestamp } = payload;
    const existingUser: any = await this.userModel?.sequelize?.query(`SELECT U.*, M.user_type FROM auth.users AS U 
      JOIN public.metadata AS M ON U.id = M.user_id WHERE U.email = :email AND M.user_type = 'practitioner'`,
      {
        replacements: { email },
        type: QueryTypes.SELECT,
        raw: true,
      }
    );

    // disable timestamp check in dev mode
    if (process.env.NODE_ENV === 'production') {
      const currentTimestamp = new Date().getTime();
      if (currentTimestamp - parseInt(timestamp) > 10 * 60 * 1000) { // 10 mins
        throw new BadRequestException(RESPONSE_MESSAGES.LINK_EXPIRED);
      }
    }

    if (!existingUser || existingUser.length === 0) {
      throw new NotFoundException(RESPONSE_MESSAGES.USER_NOT_FOUND);
    }

    const jwtPayload = {
      id: existingUser[0].id as string,
      email: existingUser[0].email as string,
    };

    const { access_token, refresh_token } = this.commonHelperService.generateJwtToken(jwtPayload);

    return {
      statusCode: HttpStatus.OK,
      message: RESPONSE_MESSAGES.LINK_VERIFIED,
      data: {
        user: { ...existingUser[0] },
        accessToken: access_token,
        refreshToken: refresh_token
      }
    };
  }

  async verifyOtp(payload: VerifyOtpDto) {
    const { email, otp } = payload;
    const existingUser = await this.userModel.findOne({ where: { email } });
    if (!existingUser) {
      throw new NotFoundException(RESPONSE_MESSAGES.USER_NOT_FOUND);
    }
    if (existingUser.otp_hash !== otp) {
      throw new BadRequestException(RESPONSE_MESSAGES.INCORRECT_OTP);
    }
    if (existingUser.otp_hash_expires_at < new Date()) {
      throw new BadRequestException(RESPONSE_MESSAGES.OTP_EXPIRED);
    }
    const jwtPayload = {
      id: existingUser.id as string,
      email: existingUser.email,
    };

    const { access_token } = this.commonHelperService.generateJwtToken(jwtPayload);

    await this.userModel.update(
      {
        otp_hash: null,
        otp_hash_expires_at: null,
        email_verified: true
      },
      { where: { email } }
    );

    return {
      statusCode: HttpStatus.OK,
      message: RESPONSE_MESSAGES.OTP_VERIFIED,
      token: access_token,
      user: { ...existingUser },
      screen: 'form',
    };
  }

  async resetPassword(@Req() req: Request, body: ResetPasswordDto) {
    try {
      const { oldPassword, newPassword } = body;
      const user = req['user'] as User;

      const userData = await this.userModel.sequelize?.query(`SELECT * FROM auth.users WHERE id = :id`, {
        replacements: { id: user.id },
        type: QueryTypes.SELECT,
        raw: true,
      });
      if (!userData || userData.length === 0) {
        throw new NotFoundException(RESPONSE_MESSAGES.USER_NOT_FOUND);
      }
      const existingUser: any = userData[0];
      // Check if the password contains the user's name or email
      if (
        newPassword.toLowerCase().includes(existingUser.email.toLowerCase()) ||
        newPassword.toLowerCase().includes(existingUser.display_name.toLowerCase())
      ) {
        throw new BadRequestException(RESPONSE_MESSAGES.PASSWORD_CONTAINS_PERSONAL_INFO);
      }

      const isCorrectPassword = await bcrypt.compare(oldPassword, existingUser.password_hash);
      if (!isCorrectPassword) {
        throw new BadRequestException(RESPONSE_MESSAGES.INCORRECT_PASSWORD);
      }

      const new_password_hash = await bcrypt.hash(newPassword, 10);
      const updatedUser = await this.userModel.sequelize?.query(`UPDATE auth.users SET password_hash = :passwordHash WHERE id = :id`, {
        replacements: { passwordHash: new_password_hash, id: user.id },
        type: QueryTypes.UPDATE,
        raw: true,
      });
      if (!updatedUser) {
        throw new BadRequestException(RESPONSE_MESSAGES.PASSWORD_RESET_FAILED);
      }
      return {
        statusCode: HttpStatus.OK,
        message: RESPONSE_MESSAGES.PASSWORD_RESET,
      };
    } catch (error) {
      console.error(error, "---error---");
      throw new BadRequestException(error.message);
    }
  }
}
