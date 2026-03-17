import { DEFAULT_OPENAI_MODEL } from "@/shared/Constants";
import {
  MEMORY_EXTRACTION_SYSTEM_PROMPT,
  createMemoryExtractionPrompt,
  parseExtractedMemory,
  ExtractedMemory,
} from "@/utils/memoryPrompts";
import * as dotenv from "dotenv";
import { NextApiRequest, NextApiResponse } from "next";
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

interface ExtractMemoryRequest {
  messages: Array<{ role: string; content: string }>;
}

interface ExtractMemoryResponse {
  memory: ExtractedMemory | null;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ExtractMemoryResponse>
) {
  if (req.method !== "POST") {
    res.status(405).json({ memory: null, error: "Method not allowed" });
    return;
  }

  const body = req.body as ExtractMemoryRequest;
  const messages = body?.messages || [];

  if (messages.length === 0) {
    res.status(400).json({ memory: null, error: "No messages provided" });
    return;
  }

  try {
    // Format messages for extraction
    const formattedMessages = messages.map((m) => {
      const role = m.role === "user" ? "用戶" : "AI";
      return `${role}: ${m.content}`;
    });

    const userPrompt = createMemoryExtractionPrompt(formattedMessages);

    const completion = await openai.createChatCompletion({
      model: DEFAULT_OPENAI_MODEL.id,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: MEMORY_EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const responseContent = completion.data.choices[0].message?.content;

    if (!responseContent) {
      res.status(400).json({
        memory: null,
        error: "Unable to extract memory from OpenAI response",
      });
      return;
    }

    const extractedMemory = parseExtractedMemory(responseContent);

    if (!extractedMemory) {
      res.status(400).json({
        memory: null,
        error: "Failed to parse extracted memory",
      });
      return;
    }

    res.status(200).json({ memory: extractedMemory });
  } catch (error) {
    console.error("Memory extraction error:", error);
    res.status(500).json({
      memory: null,
      error: "An error occurred during memory extraction",
    });
  }
}
