import { DEFAULT_OPENAI_MODEL } from "@/shared/Constants";
import { OpenAIModel } from "@/types/Model";
import * as dotenv from "dotenv";
import { NextApiRequest, NextApiResponse } from "next";
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";

// Get your environment variables
dotenv.config();

// OpenAI configuration creation
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

// OpenAI instance creation
const openai = new OpenAIApi(configuration);

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Only retry on network errors
      const isRetryable =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('socket hang up') ||
        error.response?.status >= 500;

      if (!isRetryable || i === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body;
  const messages = (body?.messages || []) as ChatCompletionRequestMessage[];
  const model = (body?.model || DEFAULT_OPENAI_MODEL) as OpenAIModel;
  const systemPrompt = body?.systemPrompt as string | undefined;

  try {
    const defaultPrompt = "你是一個友善且有幫助的 AI 助手。請用繁體中文回答問題。";
    const promptMessage: ChatCompletionRequestMessage = {
      role: "system",
      content: systemPrompt || defaultPrompt,
    };
    const initialMessages: ChatCompletionRequestMessage[] = messages.splice(
      0,
      3
    );
    const latestMessages: ChatCompletionRequestMessage[] = messages
      .slice(-5)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const completion = await retryWithBackoff(() =>
      openai.createChatCompletion({
        model: model.id,
        temperature: 0.5,
        messages: [promptMessage, ...initialMessages, ...latestMessages],
      })
    );

    const responseMessage = completion.data.choices[0].message?.content.trim();

    if (!responseMessage) {
      res
        .status(400)
        .json({ error: "Unable get response from OpenAI. Please try again." });
      return;
    }

    res.status(200).json({ message: responseMessage });
  } catch (error: any) {
    console.error("OpenAI API error:", error.message || error);

    // Provide more specific error messages
    let errorMessage = "發生錯誤，請稍後再試";

    if (error.code === 'ECONNRESET' || error.message?.includes('socket hang up')) {
      errorMessage = "網路連線中斷，請重新嘗試";
    } else if (error.response?.status === 429) {
      errorMessage = "請求太頻繁，請稍等一下再試";
    } else if (error.response?.status === 401) {
      errorMessage = "API 金鑰無效";
    }

    res.status(500).json({ error: errorMessage });
  }
}
