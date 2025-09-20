import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export interface LlmModel {
  model: BaseChatModel;
  modelInfo: string;
}

/**
 * 根據環境變數決定並建立一個 LLM 實例。
 * 這是唯一負責模型實例化的地方。
 * @returns 一個包含 LangChain 模型實例和模型資訊字串的物件。
 */
export function createLlmModel(): LlmModel {
  const provider = process.env.LLM_PROVIDER || 'gemini'; // 預設為 gemini

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('LLM_PROVIDER is set to \'openai\', but OPENAI_API_KEY is not defined.');
    }
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o';
    return {
      model: new ChatOpenAI({
        modelName: modelName,
        apiKey: process.env.OPENAI_API_KEY,
      }),
      modelInfo: `OpenAI (${modelName})`,
    };
  }

  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('LLM_PROVIDER is set to \'gemini\', but GEMINI_API_KEY is not defined.');
    }
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    return {
      model: new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey: process.env.GEMINI_API_KEY,
      }),
      modelInfo: `Gemini (${modelName})`,
    };
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}. Please use 'openai' or 'gemini'.`);
}