import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { RegisterCompanyDto, UpdateCompanyDto } from './tenants.dto';
import { TenantsService } from './tenants.service';

/** CONTROLLER – /api/companies (F1). Receives the request, validates it via the DTO, delegates to the service. */
@Controller('companies')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterCompanyDto) {
    return this.service.register(dto);
  }

  @Get('me')
  profile(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(user);
  }

  @Roles(Role.FINANCE_ADMIN)
  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateCompanyDto) {
    return this.service.updateProfile(user, dto);
  }
}
