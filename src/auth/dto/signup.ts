import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
// import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({
  name: 'PasswordDoesNotContainNameOrEmail',
  async: false,
})
export class PasswordDoesNotContainNameOrEmail
  implements ValidatorConstraintInterface
{
  validate(password: string, args: ValidationArguments) {
    const { firstName, email } = args.object as SignupDto;
    return (
      !password.includes(firstName) &&
      /* !password.includes(lastName) && */
      !password.includes(email)
    );
  }

  defaultMessage() {
    return 'Password must not contain your first name, or email.';
  }
}

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  // @ApiProperty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  // @ApiProperty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  // @ApiProperty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(15)
  @Validate(PasswordDoesNotContainNameOrEmail)
  // @ApiProperty()
  password: string;

  @IsString()
  @IsOptional()
  // @ApiPropertyOptional()
  deviceId?: string;
}
