import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestStatusEnum, RetryRequest } from './entities/request.entity';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { AttemptStatusEnum, RetryAttempt } from './entities/attempt.entity';
import { HttpService } from '@nestjs/axios';
import { Interval } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RetryWorkerService {
  private readonly logger = new Logger(RetryWorkerService.name);

  constructor(
    @InjectRepository(RetryRequest)
    private readonly requestRepo: Repository<RetryRequest>,
    @InjectRepository(RetryAttempt)
    private readonly attemptRepo: Repository<RetryAttempt>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Runs every 500ms. Picks up due requests adn processes them.
   * Uses a transaction to prevent double-processing (two workers
   * picking the same request).
   */
  @Interval(500)
  async processDueRequests(): Promise<void> {
    const due = await this.requestRepo.find({
      where: [
        {
          status: RequestStatusEnum.pending,
          nextRetryAt: LessThanOrEqual(new Date()),
        },
        {
          status: RequestStatusEnum.retrying,
          nextRetryAt: LessThanOrEqual(new Date()),
        },
      ],
      take: 10,
    });

    for (const request of due) {
      await this.requestRepo.manager.transaction(async (manager) => {
        // Re-fetch within transaction with lock (SQLite doesn't support
        // FOR UPDATE, but serializing via transaction is enough)
        const locked = await manager.findOne(RetryRequest, {
          where: { id: request.id },
        });

        if (
          !locked ||
          locked.status === RequestStatusEnum.completed ||
          locked.status === RequestStatusEnum.failed
        ) {
          return; // already processed - skip
        }

        await this.processRequest(locked, manager);
      });
    }
  }

  /**
   * Process a single request: make HTTP call, record attempt,
   * decide next action (retry, complete, fail).
   */
  private async processRequest(
    request: RetryRequest,
    manager: EntityManager, // transactional entity manager
  ): Promise<void> {
    const attemptNumber = request.attemptCount + 1;
    const startedAt = new Date();

    // Mark request as retrying
    await manager.update(RetryRequest, request.id, {
      status: RequestStatusEnum.retrying,
    });

    // Create a pending attempt record
    const attempt = manager.create(RetryAttempt, {
      requestId: request.id,
      attemptNumber,
      status: AttemptStatusEnum.pending,
      startedAt,
    });
    await manager.save(RetryAttempt, attempt);

    try {
      // Make the HTTP call
      const startTime = Date.now();
      const response = await firstValueFrom(
        this.httpService.request({
          method: request.method as any,
          url: request.url,
          data: request.body || undefined,
          timeout: 10_000,
          validateStatus: () => true,
        }),
      );
      const durationMs = Date.now() - startTime;
      const statusCode = response.status;

      // Update attempt record
      await manager.update(RetryAttempt, attempt.id, {
        status:
          statusCode >= 200 && statusCode < 300
            ? AttemptStatusEnum.success
            : AttemptStatusEnum.failed,
        responseCode: statusCode,
        durationMs,
        finishedAt: new Date(),
      });

      // Decide next action based on status code
      if (statusCode >= 200 && statusCode < 300) {
        // success, then mark as completed
        await manager.update(RetryRequest, request.id, {
          status: RequestStatusEnum.completed,
          attemptCount: attemptNumber,
          lastError: null,
          result: JSON.stringify(response.data),
        });

        this.logger.log(
          `✅ Request ${request.id} succeeded on attempt ${attemptNumber}`,
        );
        return;
      }

      if (statusCode >= 400 && statusCode < 500) {
        // client error (4xx), then fail, no retry
        await manager.update(RetryRequest, request.id, {
          status: RequestStatusEnum.failed,
          attemptCount: attemptNumber,
          lastError: `HTTP ${statusCode}: ${JSON.stringify(response.data)}`,
        });

        this.logger.warn(
          `🚫 Request ${request.id} failed with ${statusCode} (4xx) - no retry`,
        );
        return;
      }

      // 5xx or other server error, retry
      await this.handleRetry(
        request,
        attemptNumber,
        `HTTP ${statusCode}`,
        manager,
      );
    } catch (error: any) {
      // Network error, timout, DNS failure, etc.
      const errorMsg = error.code || error.message || 'Unknown network error';
      const durationMs = Date.now() - startedAt.getTime();

      // Update attempt as failed
      await manager.update(RetryAttempt, attempt.id, {
        status: AttemptStatusEnum.failed,
        errorMessage: errorMsg,
        durationMs,
        finishedAt: new Date(),
      });

      // Network errors are always retryable
      await this.handleRetry(request, attemptNumber, errorMsg, manager);
    }
  }

  /**
   * Calculate next retry time with exponential backoff + jitter,
   * then either schedule a retry or dead-letter.
   */
  private async handleRetry(
    request: RetryRequest,
    attemptNumber: number,
    errorMessage: string,
    manager: EntityManager,
  ): Promise<void> {
    const newAttemptCount = attemptNumber;

    if (newAttemptCount >= request.maxRetries) {
      // dead-letter
      await manager.update(RetryRequest, request.id, {
        status: RequestStatusEnum.failed,
        attemptCount: newAttemptCount,
        lastError: `Dead-letter after ${newAttemptCount} attempts. Last error: ${errorMessage}`,
      });

      this.logger.warn(
        `Request ${request.id} dead-lettered after ${newAttemptCount} attempts`,
      );
      return;
    }

    // Calculate next retry time with exponential backoff + jitter
    const nextRetryAt = this.calculateNextRetry(
      request.backoffMs,
      newAttemptCount,
    );

    await manager.update(RetryRequest, request.id, {
      status: RequestStatusEnum.retrying,
      attemptCount: newAttemptCount,
      lastError: errorMessage,
      nextRetryAt,
    });

    this.logger.log(
      `Request ${request.id} will retry at ${nextRetryAt.toISOString()} (attempt ${newAttemptCount}/${request.maxRetries})`,
    );
  }

  /**
   * Exponential backoff with jitter.
   * Formula: delay = backoffMs * 2^(attemptNumber - 1) * random(0.8, 1.2)
   */
  private calculateNextRetry(backoffMs: number, attemptCount: number): Date {
    const baseDelay = backoffMs * Math.pow(2, attemptCount - 1);
    const jitterFactor = 0.8 + Math.random() * 0.4;
    const actualDelayMs = baseDelay * jitterFactor;

    return new Date(Date.now() + actualDelayMs);
  }
}
