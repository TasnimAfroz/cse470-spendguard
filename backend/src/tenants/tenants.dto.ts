import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'timezone' })
class IsTimezone implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'timezone must be a valid IANA timezone such as Asia/Dhaka';
  }
}

export class RegisterCompanyDto {
  @IsString()
  @Length(2, 100)
  companyName: string;

  @IsOptional()
  @IsIn(['BDT', 'USD', 'EUR', 'GBP'])
  baseCurrency?: string;

  @IsOptional()
  @Validate(IsTimezone)
  timezone?: string;

  @IsString()
  @Length(2, 100)
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  adminPassword: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @Validate(IsTimezone)
  timezone?: string;
}
