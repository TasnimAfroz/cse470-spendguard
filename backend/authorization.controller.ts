import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { ChargeDto } from './authorization.dto';
import { AuthorizationService } from './authorization.service';

/**
 * CONTROLLER – /api/simulator (F8).
 * Plays the role of the card network / merchant: it sends an authorization request
 * and receives APPROVED or DECLINED. A declined charge is still a valid business answer, so the status is 200.
 */
@Controller('simulator')
export class AuthorizationController {
  constructor(private readonly service: AuthorizationService) {}

  @Post('charge')
  @HttpCode(200)
  charge(@CurrentUser() user: AuthUser, @Body() dto: ChargeDto) {
    return this.service.charge(user, dto);
  }

  @Get('transactions')
  recent(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.recent(user, limit ? Number(limit) : 25);
  }
}
