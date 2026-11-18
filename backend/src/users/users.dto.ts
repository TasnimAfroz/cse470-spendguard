import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MinLength, ValidateIf } from 'class-validator';
import { Role } from '../common/enums';

export class CreateUserDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsEmail()
  email: string;

  @IsEnum(Role)
  role: Role;

  /** Required for employees; optional for finance roles and for managers (set when assigned to a department). */
  @ValidateIf((o) => o.role === Role.EMPLOYEE || o.departmentId !== undefined)
  @IsUUID()
  departmentId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}
