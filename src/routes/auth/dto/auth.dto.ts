import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// Password rules deliberately mirror what user-service enforces at the service
// boundary (argon2 can hash anything, the policy lives here/at the edge).
// MIN=8 matches the baseline the plan uses; MAX=128 keeps argon2 time bounded.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 100;

export class RegisterDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254, { message: 'email is too long' })
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `password must be at least ${PASSWORD_MIN} characters` })
  @MaxLength(PASSWORD_MAX, { message: `password must be at most ${PASSWORD_MAX} characters` })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'firstName is required' })
  @MaxLength(NAME_MAX)
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'lastName is required' })
  @MaxLength(NAME_MAX)
  lastName!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'password is required' })
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'refreshToken is required' })
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  @IsNotEmpty({ message: 'refreshToken is required' })
  refreshToken!: string;
}
