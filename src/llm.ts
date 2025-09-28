import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

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
}

export interface ModelDetails {
  provider: 'openai' | 'gemini';
  modelName: string;
  modelInfo: string;
}

// --- Gemini API Key Management ---
let geminiApiKeys: string[] | null = null;
let geminiApiKeyIndex = 0;

function loadGeminiApiKeys(): void {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY);
  }
  let i = 0;
  while (process.env[`GEMINI_API_KEY_${i}`]) {
    keys.push(process.env[`GEMINI_API_KEY_${i}`] as string);
    i++;
  }
  geminiApiKeys = keys;
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
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
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
  return {
    model: new ChatGoogleGenerativeAI({
      model: modelName,
      apiKey: apiKey,
    }),
    modelInfo: modelInfo,
    apiKeyUsed: apiKey, // 回傳使用的 API 金鑰
  };
}