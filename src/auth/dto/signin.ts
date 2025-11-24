import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
// import { ApiProperty } from '@nestjs/swagger';

export class SigninDto {
  @IsEmail()
  @IsNotEmpty()
  // @ApiProperty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  // @ApiProperty()
  password: string;
}

export class VerifyMfaCodeDto {
  @IsEmail()
  @IsNotEmpty()
  // @ApiProperty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  // @ApiProperty()
  mfaCode: string;
}

export class PractitionerLoginDto {
  @IsEmail()
  @IsNotEmpty()
  // @ApiProperty()
  email: string;

}

export class PractitionerLoginLinkVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  // @ApiProperty()
  timestamp: string;

  @IsEmail()
  @IsNotEmpty()
  // @ApiProperty()
  email: string;
}