import { Controller, Get, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

// Track how many times each endpoint has been called
const callCounts = new Map<string, number>();

@Controller('mock')
export class MockController {
  /**
   * Fails 3 times, succeeds on the 4th attempt.
   * Uses the `id` query parameter to track per-request state.
   */
  @Get('fail-three-times')
  async failThreeTimes(@Req() req: Request) {
    const id = req.query.id as string || 'default';
    const count = (callCounts.get(id) || 0) + 1;
    callCounts.set(id, count);

    console.log(`[Mock] Request ${id} — attempt ${count}`);

    if (count < 4) {
      // Fail with 500
      throw new HttpException(
        {
          statusCode: 500,
          message: `Simulated failure on attempt ${count}/3`,
          attempt: count,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Success on 4th
    return {
      statusCode: 200,
      message: 'Success after 3 failures!',
      attempt: count,
    };
  }

  /**
   * Always returns 400 — tests that 4xx is NOT retried.
   */
  @Get('always-400')
  async always400() {
    throw new HttpException(
      {
        statusCode: 400,
        message: 'Bad request — 4xx errors should not retry',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Always fails with 500 — tests dead-letter after maxRetries.
   */
  @Get('always-500')
  async always500() {
    throw new HttpException(
      {
        statusCode: 500,
        message: 'Simulated persistent failure',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Reset call counts (useful between test runs).
   */
  @Post('reset')
  async reset() {
    callCounts.clear();
    return { message: 'Call counts reset' };
  }
}