import { IsEmail, IsNotEmpty, Length } from 'class-validator';
// import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @IsEmail()
  @IsNotEmpty()
  // @ApiProperty()
  email: string;

  @IsNotEmpty()
  // @ApiProperty()
  @Length(6)
  otp: string;
}
