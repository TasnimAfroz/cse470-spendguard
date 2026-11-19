import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max, Min } from 'class-validator';
import { MerchantCategory } from '../common/enums';

/** What a (simulated) merchant sends when a customer pays with a virtual card. */
export class ChargeDto {
  @Matches(/^\d{16}$/, { message: 'cardNumber must be 16 digits' })
  cardNumber: string;

  @IsInt() @Min(1) @Max(12)
  expiryMonth: number;

  @IsInt() @Min(2020) @Max(2100)
  expiryYear: number;

  @Matches(/^\d{3}$/, { message: 'cvv must be 3 digits' })
  cvv: string;

  @IsString()
  @Length(1, 80)
  merchantName: string;

  @IsEnum(MerchantCategory)
  merchantCategory: MerchantCategory;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  amount: number;

  /**
   * TESTING AID for the demo only: pretend the purchase happens at this moment,
   * so the time-window rule can be shown without waiting for night time.
   * It affects ONLY the day/time check; limits use the real clock.
   */
  @IsOptional()
  @IsDateString()
  simulatedAt?: string;
}
