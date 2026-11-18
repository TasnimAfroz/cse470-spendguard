import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @Length(2, 60)
  name: string;

  @Matches(/^[A-Za-z0-9]{2,10}$/, { message: 'code must be 2-10 letters or digits, e.g. ENG' })
  code: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{2,10}$/, { message: 'code must be 2-10 letters or digits, e.g. ENG' })
  code?: string;
}

export class AssignManagerDto {
  @IsUUID()
  managerId: string;
}
