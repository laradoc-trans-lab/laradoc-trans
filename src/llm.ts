import { ChatGoogle } from "@langchain/google";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { PerKeyRateLimiter } from './geminiRateLimiter';

export const DEFAULT_GEMINI_RATE_LIMIT_PER_MINUTE = 5;

export class ApiKeyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyNotFoundError';
  }
}

export interface LlmModel {
  model: BaseChatModel;
  modelInfo: string;
  apiKeyUsed: string; // 新增：記錄使用的 API 金鑰
  prepareForRequest?: () => Promise<LlmModel>;
}

export interface ModelDetails {
  provider: 'openai' | 'gemini';
  modelName: string;
  modelInfo: string;
}

// --- Gemini API Key Management ---
let geminiApiKeys: string[] | null = null;
let geminiApiKeyIndex = 0;
let geminiRateLimiter: PerKeyRateLimiter | null = null;
let geminiRateLimitPerMinute: number | null = null;

function loadGeminiApiKeys(): void {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY);
  }

  const numberedKeys = Object.entries(process.env)
    .filter(([name, value]) => /^GEMINI_API_KEY_\d+$/.test(name) && Boolean(value))
    .sort(([firstName], [secondName]) => {
      const firstIndex = Number(firstName.replace('GEMINI_API_KEY_', ''));
      const secondIndex = Number(secondName.replace('GEMINI_API_KEY_', ''));
      return firstIndex - secondIndex;
    });

  for (const [, key] of numberedKeys) {
    keys.push(key as string);
  }

  geminiApiKeys = [...new Set(keys)];
}

function getNextGeminiApiKey(): string {
  if (geminiApiKeys === null) {
    loadGeminiApiKeys();
  }

  if (geminiApiKeys!.length === 0) {
    // Throw generic error
    throw new ApiKeyNotFoundError("API key for the selected LLM provider is not configured. Please check your .env file.");
  }
  const key = geminiApiKeys![geminiApiKeyIndex];
  geminiApiKeyIndex = (geminiApiKeyIndex + 1) % geminiApiKeys!.length;
  return key;
}

function getGeminiRateLimitPerMinute(): number {
  const configuredLimit = process.env.GEMINI_RATE_LIMIT_PER_MINUTE?.trim();
  if (!configuredLimit) {
    return DEFAULT_GEMINI_RATE_LIMIT_PER_MINUTE;
  }

  const rateLimit = Number(configuredLimit);
  if (!Number.isSafeInteger(rateLimit) || rateLimit <= 0) {
    throw new Error('GEMINI_RATE_LIMIT_PER_MINUTE must be a positive integer.');
  }

  return rateLimit;
}

function getGeminiRateLimiter(): PerKeyRateLimiter {
  const rateLimit = getGeminiRateLimitPerMinute();
  if (geminiRateLimiter === null || geminiRateLimitPerMinute !== rateLimit) {
    geminiRateLimiter = new PerKeyRateLimiter(rateLimit);
    geminiRateLimitPerMinute = rateLimit;
  }

  return geminiRateLimiter;
}

async function reserveGeminiRequest(preferredKey: string): Promise<string> {
  if (geminiApiKeys === null) {
    loadGeminiApiKeys();
  }

  return getGeminiRateLimiter().acquireAny(geminiApiKeys!, preferredKey);
}

function createGeminiLlmModel(apiKey: string, modelName: string, modelInfo: string): LlmModel {
  const llmModel: LlmModel = {
    model: new ChatGoogle({
      model: modelName,
      apiKey,
    }),
    modelInfo,
    apiKeyUsed: apiKey,
  };

  llmModel.prepareForRequest = async () => {
    const requestApiKey = await reserveGeminiRequest(llmModel.apiKeyUsed);
    if (requestApiKey === llmModel.apiKeyUsed) {
      return llmModel;
    }

    return createGeminiLlmModel(requestApiKey, modelName, modelInfo);
  };

  return llmModel;
}

/**
 * 重設 Gemini 金鑰輪替與速率限制狀態，主要供測試使用。
 */
export function resetGeminiApiKeyState(): void {
  geminiApiKeys = null;
  geminiApiKeyIndex = 0;
  geminiRateLimiter?.reset();
  geminiRateLimiter = null;
  geminiRateLimitPerMinute = null;
}
// ---------------------------------

/**
 * 獲取當前配置的 LLM 模型詳細資訊，但不建立模型實例。
 * @returns 包含提供商、模型名稱和格式化資訊字串的物件。
 */
export function getModelInfo(): ModelDetails {
  const provider = (process.env.LLM_PROVIDER || 'gemini') as 'openai' | 'gemini';

  if (provider === 'openai') {
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o';
    return {
      provider: 'openai',
      modelName,
      modelInfo: `OpenAI (${modelName})`,
    };
  }

  if (provider === 'gemini') {
    const modelName = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
    return {
      provider: 'gemini',
      modelName,
      modelInfo: `Gemini (${modelName})`,
    };
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}. Please use 'openai' or 'gemini'.`);
}

/**
 * 根據環境變數決定並建立一個 LLM 實例。
 * 這是唯一負責模型實例化的地方。
 * @returns 一個包含 LangChain 模型實例和模型資訊字串的物件。
 */
export function createLlmModel(): LlmModel {
  const { provider, modelName, modelInfo } = getModelInfo();

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      // Throw generic error
      throw new ApiKeyNotFoundError("API key for the selected LLM provider is not configured. Please check your .env file.");
    }
    return {
      model: new ChatOpenAI({
        modelName: modelName,
        apiKey: process.env.OPENAI_API_KEY,
      }),
      modelInfo: modelInfo,
      apiKeyUsed: process.env.OPENAI_API_KEY, // 回傳使用的 API 金鑰
    };
  }

  // provider === 'gemini'
  const apiKey = getNextGeminiApiKey();
  return createGeminiLlmModel(apiKey, modelName, modelInfo);
}
