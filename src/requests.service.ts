import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestStatusEnum, RetryRequest } from './entities/request.entity';
import { Repository } from 'typeorm';
import { CreateRequestDto } from './dto/create-request.dto';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RetryRequest)
    private readonly requestRepo: Repository<RetryRequest>,
  ) {}

  async create(dto: CreateRequestDto): Promise<RetryRequest> {
    const request = this.requestRepo.create({
      url: dto.url,
      method: dto.method || 'GET',
      body: dto.body || undefined,
      maxRetries: dto.maxRetries || 5,
      backoffMs: dto.backoffMs || 1000,
      status: RequestStatusEnum.pending,
      nextRetryAt: new Date(),
    });

    return this.requestRepo.save(request);
  }

  async findOne(id: string): Promise<RetryRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: {
        attempts: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return request;
  }

  async findAll(status?: string): Promise<RetryRequest[]> {
    const where = status ? { status: status as RequestStatusEnum } : {};

    return this.requestRepo.find({
      where,
      relations: {
        attempts: true,
      },
      order: { createdAt: 'DESC' as const },
    });
  }
}
