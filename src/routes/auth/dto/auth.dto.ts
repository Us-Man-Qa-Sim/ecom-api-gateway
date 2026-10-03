import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// Password rules deliberately mirror what user-service enforces at the service
// boundary (argon2 can hash anything, the policy lives here/at the edge).
// MIN=8 matches the baseline the plan uses; MAX=128 keeps argon2 time bounded.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 100;

export class RegisterDto {
  @ApiProperty({ format: 'email', example: 'alice@example.com', maxLength: 254 })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254, { message: 'email is too long' })
  email!: string;

  @ApiProperty({
    minLength: PASSWORD_MIN,
    maxLength: PASSWORD_MAX,
    example: 'correct-horse-battery',
    format: 'password',
  })
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `password must be at least ${PASSWORD_MIN} characters` })
  @MaxLength(PASSWORD_MAX, { message: `password must be at most ${PASSWORD_MAX} characters` })
  password!: string;

  @ApiProperty({ maxLength: NAME_MAX, example: 'Alice' })
  @IsString()
  @IsNotEmpty({ message: 'firstName is required' })
  @MaxLength(NAME_MAX)
  firstName!: string;

  @ApiProperty({ maxLength: NAME_MAX, example: 'Nguyen' })
  @IsString()
  @IsNotEmpty({ message: 'lastName is required' })
  @MaxLength(NAME_MAX)
  lastName!: string;
}

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'alice@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @ApiProperty({ format: 'password', example: 'correct-horse-battery' })
  @IsString()
  @IsNotEmpty({ message: 'password is required' })
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token returned by /auth/login.' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken is required' })
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'The refresh token to revoke.' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken is required' })
  refreshToken!: string;
}
