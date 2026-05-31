import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetryAttempt } from './entities/attempt.entity';
import { RetryRequest } from './entities/request.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'retry-engine.sqlite',
      entities: [RetryRequest, RetryAttempt],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([RetryRequest, RetryAttempt]),
    ScheduleModule.forRoot(),
    HttpModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class AppModule {}
