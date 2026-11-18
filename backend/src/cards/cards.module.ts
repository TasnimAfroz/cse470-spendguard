import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardRuleHistory, CardStatusHistory } from './card-history.entities';
import { CardRulesValidator } from './card-rules.validator';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardFactory } from './patterns/card.factory';
import { VirtualCard } from './virtual-card.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VirtualCard, CardRuleHistory, CardStatusHistory])],
  controllers: [CardsController],
  providers: [CardsService, CardFactory, CardRulesValidator],
  exports: [CardsService],
})
export class CardsModule {}
