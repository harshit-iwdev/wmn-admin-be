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
