import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { DepositDto, TransferDto } from './wallets.dto';
import { WalletsService } from './wallets.service';

const FINANCE = [Role.FINANCE_ADMIN, Role.FINANCE_MANAGER];

/** CONTROLLER – /api/wallets (F4). */
@Controller('wallets')
export class WalletsController {
  constructor(private readonly service: WalletsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Get(':id/ledger')
  ledger(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('limit') limit?: string) {
    return this.service.ledger(user, id, limit ? Number(limit) : 100);
  }

  @Roles(...FINANCE)
  @Post('treasury/deposit')
  deposit(@CurrentUser() user: AuthUser, @Body() dto: DepositDto) {
    return this.service.deposit(user, dto);
  }

  @Roles(...FINANCE)
  @Post('allocate')
  allocate(@CurrentUser() user: AuthUser, @Body() dto: TransferDto) {
    return this.service.allocate(user, dto);
  }

  @Roles(...FINANCE)
  @Post('reclaim')
  reclaim(@CurrentUser() user: AuthUser, @Body() dto: TransferDto) {
    return this.service.reclaim(user, dto);
  }
}
