// proxy.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProxyController } from './proxy.controller';

@Module({
  imports: [HttpModule],
  controllers: [ProxyController],
})
export class ProxyModule {}