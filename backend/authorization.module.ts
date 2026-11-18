import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsModule } from '../cards/cards.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';
import { CardTransaction } from './card-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CardTransaction]), CardsModule, WalletsModule],
  controllers: [AuthorizationController],
  providers: [AuthorizationService],
})
export class AuthorizationModule {}
