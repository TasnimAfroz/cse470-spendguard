import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Max, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { CardType, MerchantCategory } from '../common/enums';

export class HoursDto {
  @IsInt() @Min(0) @Max(23)
  start: number;

  @IsInt() @Min(1) @Max(24)
  end: number;
}

/** Validates the shape of a card's rules; the cross-field rules (ordering of limits) live in CardRulesValidator. */
export class CardRulesDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  perTransactionLimit?: number | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  dailyLimit?: number | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  monthlyLimit?: number | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  lifetimeLimit?: number | null;

  @IsOptional() @IsArray() @IsEnum(MerchantCategory, { each: true })
  allowedCategories?: MerchantCategory[];

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 80, { each: true })
  allowedMerchants?: string[];

  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  allowedDays?: number[];

  @IsOptional() @ValidateIf((_o, v) => v !== null) @ValidateNested() @Type(() => HoursDto)
  allowedHours?: HoursDto | null;
}

export class IssueCardDto {
  @IsEnum(CardType)
  type: CardType;

  @IsUUID()
  holderId: string;

  @IsString()
  @Length(2, 60)
  nickname: string;

  /** SINGLE_USE: max payment. SUBSCRIPTION: fixed monthly amount. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  /** SUBSCRIPTION only. */
  @IsOptional()
  @IsString()
  @Length(1, 80)
  merchantName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardRulesDto)
  rules?: CardRulesDto;
}

export class ReasonDto {
  @IsString()
  @Length(3, 300)
  reason: string;
}

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @Length(0, 300)
  reason?: string;
}
