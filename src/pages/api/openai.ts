import { DEFAULT_OPENAI_MODEL, GPT4_OPENAI_MODEL } from "@/shared/Constants";
import { getOpenAIClient, isMissingOpenAIKeyError } from "@/server/openaiClient";
import { OpenAIModel } from "@/types/Model";
import { NextApiRequest, NextApiResponse } from "next";
import { ChatCompletionRequestMessage } from "openai";

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

function getProviderErrorStatus(error: any) {
  return error?.response?.status;
}

function getProviderErrorMessage(error: any) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    String(error)
  );
}

function shouldFallbackModel(error: any) {
  const status = getProviderErrorStatus(error);
  return status === 400 || status === 403 || status === 404;
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
    const openai = getOpenAIClient();
    const defaultPrompt = "你是一個友善、有耐心的 AI 助手，專門為國小 3 到 6 年級的學生服務。用繁體中文回答，每次回答簡短（不超過 3-4 句），用小朋友能懂的簡單詞彙，語氣親切像好朋友聊天。";
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

    const requestMessages = [promptMessage, ...initialMessages, ...latestMessages];
    let usedModelId = model.id;
    let completion;

    try {
      completion = await retryWithBackoff(() =>
        openai.createChatCompletion({
          model: usedModelId,
          temperature: 0.5,
          messages: requestMessages,
        })
      );
    } catch (error: any) {
      const fallbackModelId = GPT4_OPENAI_MODEL.id;
      if (usedModelId !== fallbackModelId && shouldFallbackModel(error)) {
        console.warn(
          `OpenAI model ${usedModelId} failed, falling back to ${fallbackModelId}:`,
          getProviderErrorMessage(error)
        );
        usedModelId = fallbackModelId;
        completion = await retryWithBackoff(() =>
          openai.createChatCompletion({
            model: usedModelId,
            temperature: 0.5,
            messages: requestMessages,
          })
        );
      } else {
        throw error;
      }
    }

    const responseMessage = completion.data.choices[0]?.message?.content?.trim();

    if (!responseMessage) {
      res
        .status(400)
        .json({ error: "Unable get response from OpenAI. Please try again." });
      return;
    }

    res.status(200).json({ message: responseMessage, model: usedModelId });
  } catch (error: any) {
    console.error(
      "OpenAI API error:",
      getProviderErrorStatus(error),
      getProviderErrorMessage(error)
    );

    if (isMissingOpenAIKeyError(error)) {
      res.status(500).json({ error: error.message });
      return;
    }

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
