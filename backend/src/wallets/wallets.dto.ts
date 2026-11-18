import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Max } from 'class-validator';

export class DepositDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000)
  amount: number;

  /** e.g. bank transfer reference – the top-up itself is simulated. */
  @IsString()
  @Length(2, 100)
  reference: string;
}

export class TransferDto {
  @IsUUID()
  departmentId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000)
  amount: number;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}
