import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { BadRequestException, HttpStatus, NotFoundException, Req } from '@nestjs/common';
import { PractitionerLoginDto, PractitionerLoginLinkVerificationDto, SigninDto } from './dto/signin';
import * as bcrypt from 'bcrypt';
import { RESPONSE_MESSAGES } from 'src/common/utils/responseMessages';
import { ForgotPasswordDto } from './dto/forgotPassword';
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

  // async signup(payload: SignupDto) {
  //   const { email, firstName, lastName, password } = payload;

  //   // Check if the user already exists
  //   const existingUser = await this.userModel.findOne({ email });
  //   if (existingUser?.isVerified) {
  //     throw new UnprocessableEntityException(
  //       RESPONSE_MESSAGES.EMAIL_ALREADY_EXITS,
  //     );
  //   }
  //   const otp = this.commonHelperService.generateRandomNumericValue();
  //   const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); //10 mins validity

  //   if (existingUser) {
  //     await this.userModel.updateOne(
  //       { email },
  //       { $set: { firstName, lastName, password, otp, otpExpiry } },
  //     );
  //   } else {
  //     const user = new this.userModel({
  //       firstName,
  //       lastName,
  //       password,
  //       email,
  //       otp,
  //       otpExpiry,
  //     });
  //     await user.save();
  //   }

  //   const properties = {
  //     otp,
  //     fullName: `${firstName} ${lastName}`,
  //   };

  //   const profile = {
  //     email,
  //     first_name: firstName,
  //     last_name: lastName,
  //   };

  //   await this.commonHelperService.sendKlaviyoEvent(
  //     'new_account_created',
  //     properties,
  //     profile,
  //   );

  //   // Return the response
  //   return {
  //     statusCode: HttpStatus.CREATED,
  //     message: RESPONSE_MESSAGES.OTP_SENT,
  //     otpSent: true,
  //     screen: 'verify-otp-email',
  //   };
  // }

  async signin(payload: SigninDto) {
    try {
      const { email, password } = payload;
      const users = await this.userModel?.sequelize?.query(
        'SELECT * FROM auth.users WHERE email = :email',
        {
          replacements: { email },
          type: QueryTypes.SELECT, // ✅ Use imported QueryTypes
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
      console.log(email, "---email---");
      const users = await this.userModel?.sequelize?.query(`SELECT U.*, M.user_type FROM auth.users AS U 
        JOIN public.metadata AS M ON U.id = M.user_id 
        WHERE U.email = :email AND M.user_type = 'practitioner'`,
        {
          replacements: { email },
          type: QueryTypes.SELECT, // ✅ Use imported QueryTypes
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
      JOIN public.metadata AS M ON U.id = M.user_id 
      WHERE U.email = :email AND M.user_type = 'practitioner'`,
      {
        replacements: { email },
        type: QueryTypes.SELECT, // ✅ Use imported QueryTypes
        raw: true,
      }
    );

    // disable timestamp check in dev mode
    if (process.env.NODE_ENV === 'development') {
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

  async forgotPassword(payload: ForgotPasswordDto) {
    const { email } = payload;
    const existingUser = await this.userModel.findOne({ where: { email } });

    if (!existingUser) {
      throw new NotFoundException(RESPONSE_MESSAGES.USER_NOT_FOUND);
    }

    if (existingUser.email_verified === false) {
      throw new BadRequestException(RESPONSE_MESSAGES.USER_NOT_VERIFIED);
    }

    const otp = this.commonHelperService.generateRandomNumericValue();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); //10 mins validity

    const properties = {
      otp,
      fullName: `${existingUser.display_name}`,
    };

    const profile = {
      email,
      first_name: existingUser.display_name,
      last_name: existingUser.display_name,
    };

    await this.commonHelperService.sendKlaviyoEvent(
      'reset_password',
      properties,
      profile,
    );

    await this.userModel.update(
      {
        otp_hash: otp,
        otp_hash_expires_at: otpExpiry,
        otp_method_last_used: 'email',
      },
      { where: { email } }
    );

    return {
      statusCode: HttpStatus.OK,
      message: RESPONSE_MESSAGES.OTP_SENT,
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

    const { access_token } =
      this.commonHelperService.generateJwtToken(jwtPayload);

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
    const { password } = body;
    const user = req['user'] as User;

    const existingUser = await this.userModel.findOne({ where: { id: user.id } });
    if (!existingUser) {
      throw new NotFoundException(RESPONSE_MESSAGES.USER_NOT_FOUND);
    }

    // Check if the password contains the user's name or email
    if (
      password.toLowerCase().includes(existingUser.email.toLowerCase()) ||
      password.toLowerCase().includes(existingUser.display_name.toLowerCase())
    ) {
      throw new BadRequestException(
        RESPONSE_MESSAGES.PASSWORD_CONTAINS_PERSONAL_INFO,
      );
    }

    existingUser.password_hash = await bcrypt.hash(password, 10);
    /* existingUser.markModified('password'); // Ensures the pre-save hook runs\ */
    await existingUser.save();
    return {
      statusCode: HttpStatus.OK,
      message: RESPONSE_MESSAGES.PASSWORD_RESET,
    };
  }
}
