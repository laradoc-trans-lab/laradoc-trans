jest.mock('@langchain/google', () => ({
  ChatGoogle: jest.fn().mockImplementation((options: { model: string; apiKey: string }) => options),
}));

import { PerKeyRateLimiter } from '../src/geminiRateLimiter';
import {
  createLlmModel,
  resetGeminiApiKeyState,
} from '../src/llm';

describe('Gemini rate limit control', () => {
  const environmentNames = [
    'LLM_PROVIDER',
    'GEMINI_API_KEY',
    'GEMINI_API_KEY_0',
    'GEMINI_API_KEY_1',
    'GEMINI_RATE_LIMIT_PER_MINUTE',
  ];
  const originalEnvironment = new Map(
    environmentNames.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'key-a';
    process.env.GEMINI_API_KEY_0 = 'key-b';
    process.env.GEMINI_API_KEY_1 = '';
    delete process.env.GEMINI_RATE_LIMIT_PER_MINUTE;
    resetGeminiApiKeyState();
  });

  afterEach(() => {
    resetGeminiApiKeyState();
    for (const name of environmentNames) {
      const originalValue = originalEnvironment.get(name);
      if (originalValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  });

  test('keeps request quotas independent for each API key and waits when all are full', async () => {
    let currentTime = 0;
    const sleepCalls: number[] = [];
    const limiter = new PerKeyRateLimiter(1, 60_000, {
      now: () => currentTime,
      sleep: async (milliseconds) => {
        sleepCalls.push(milliseconds);
        currentTime += milliseconds;
      },
    });

    await limiter.acquireAny(['key-a', 'key-b'], 'key-a');
    await limiter.acquireAny(['key-a', 'key-b'], 'key-a');

    expect(sleepCalls).toEqual([]);

    await limiter.acquireAny(['key-a', 'key-b'], 'key-a');

    expect(sleepCalls).toEqual([60_001]);
  });

  test('reserves the rate-limit slot immediately before a Gemini request', async () => {
    process.env.GEMINI_RATE_LIMIT_PER_MINUTE = '1';

    const firstModel = createLlmModel();
    const secondModel = createLlmModel();

    const [preparedFirstModel, preparedSecondModel] = await Promise.all([
      firstModel.prepareForRequest?.(),
      secondModel.prepareForRequest?.(),
    ]);

    expect(preparedFirstModel?.apiKeyUsed).toBe('key-a');
    expect(preparedSecondModel?.apiKeyUsed).toBe('key-b');
  });
});
