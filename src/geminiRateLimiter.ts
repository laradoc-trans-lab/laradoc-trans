export const GEMINI_RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimiterClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

const systemClock: RateLimiterClock = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

/**
 * 以滑動時間窗限制每一組 API 金鑰的請求次數。
 */
export class PerKeyRateLimiter {
  private readonly requestTimestamps = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMilliseconds = GEMINI_RATE_LIMIT_WINDOW_MS,
    private readonly clock: RateLimiterClock = systemClock,
  ) {
    if (!Number.isSafeInteger(maxRequests) || maxRequests <= 0) {
      throw new Error('The rate limit must be a positive integer.');
    }

    if (!Number.isSafeInteger(windowMilliseconds) || windowMilliseconds <= 0) {
      throw new Error('The rate limit window must be a positive integer.');
    }
  }

  /**
   * 為指定金鑰保留一個請求額度。
   */
  public async acquire(key: string): Promise<void> {
    await this.acquireAny([key], key);
  }

  /**
   * 從仍有額度的金鑰中保留一個請求額度；全部滿額時等待最早可用的金鑰。
   */
  public async acquireAny(keys: readonly string[], preferredKey?: string): Promise<string> {
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 0) {
      throw new Error('At least one API key is required for rate limiting.');
    }

    while (true) {
      const now = this.clock.now();
      const orderedKeys = this.orderKeys(uniqueKeys, preferredKey);
      let earliestRequestTimestamp: number | undefined;

      for (const key of orderedKeys) {
        const timestamps = this.getActiveRequestTimestamps(key, now);
        if (timestamps.length < this.maxRequests) {
          timestamps.push(now);
          return key;
        }

        const oldestRequestTimestamp = timestamps[0];
        if (
          earliestRequestTimestamp === undefined ||
          oldestRequestTimestamp < earliestRequestTimestamp
        ) {
          earliestRequestTimestamp = oldestRequestTimestamp;
        }
      }

      const waitMilliseconds = Math.max(
        1,
        (earliestRequestTimestamp ?? now) + this.windowMilliseconds - now + 1,
      );
      await this.clock.sleep(waitMilliseconds);
    }
  }

  /**
   * 清除目前記錄的額度，供測試或重新載入設定時使用。
   */
  public reset(): void {
    this.requestTimestamps.clear();
  }

  private getActiveRequestTimestamps(key: string, now: number): number[] {
    const timestamps = this.requestTimestamps.get(key) ?? [];
    const oldestValidTimestamp = now - this.windowMilliseconds;
    const activeTimestamps = timestamps.filter((timestamp) => timestamp > oldestValidTimestamp);
    this.requestTimestamps.set(key, activeTimestamps);
    return activeTimestamps;
  }

  private orderKeys(keys: readonly string[], preferredKey?: string): string[] {
    if (!preferredKey || !keys.includes(preferredKey)) {
      return [...keys];
    }

    return [preferredKey, ...keys.filter((key) => key !== preferredKey)];
  }
}
