import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { CardStatus, Role } from '../common/enums';
import { CardRulesDto, IssueCardDto, OptionalReasonDto, ReasonDto } from './cards.dto';
import { CardsService } from './cards.service';

const MANAGERS = [Role.FINANCE_ADMIN, Role.FINANCE_MANAGER, Role.DEPARTMENT_MANAGER];

/** CONTROLLER – /api/cards (F5, F6, F7). */
@Controller('cards')
export class CardsController {
  constructor(private readonly service: CardsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: CardStatus,
    @Query('departmentId') departmentId?: string,
    @Query('holderId') holderId?: string,
  ) {
    return this.service.list(user, { status, departmentId, holderId });
  }

  @Roles(...MANAGERS)
  @Post()
  issue(@CurrentUser() user: AuthUser, @Body() dto: IssueCardDto) {
    return this.service.issue(user, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user, id);
  }

  @Post(':id/reveal')
  @HttpCode(200)
  reveal(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reveal(user, id);
  }

  @Roles(...MANAGERS)
  @Patch(':id/rules')
  updateRules(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CardRulesDto) {
    return this.service.updateRules(user, id, dto);
  }

  @Get(':id/rule-history')
  ruleHistory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.ruleHistory(user, id);
  }

  @Post(':id/freeze')
  @HttpCode(200)
  freeze(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OptionalReasonDto) {
    return this.service.changeStatus(user, id, 'freeze', dto.reason);
  }

  @Roles(...MANAGERS)
  @Post(':id/unfreeze')
  @HttpCode(200)
  unfreeze(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OptionalReasonDto) {
    return this.service.changeStatus(user, id, 'unfreeze', dto.reason);
  }

  @Roles(...MANAGERS)
  @Post(':id/terminate')
  @HttpCode(200)
  terminate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.service.changeStatus(user, id, 'terminate', dto.reason);
  }

  @Get(':id/status-history')
  statusHistory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.statusHistory(user, id);
  }
}
