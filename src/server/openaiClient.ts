import { Configuration, OpenAIApi } from "openai";

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY not configured");
    this.name = "MissingOpenAIKeyError";
  }
}

let openaiClient: OpenAIApi | null = null;

export function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingOpenAIKeyError();
  }
  return apiKey;
}

export function getOpenAIClient() {
  const apiKey = getOpenAIApiKey();

  if (!openaiClient) {
    openaiClient = new OpenAIApi(new Configuration({ apiKey }));
  }

  return openaiClient;
}

export function isMissingOpenAIKeyError(error: unknown) {
  return error instanceof MissingOpenAIKeyError;
}

export function openAIAuthHeader() {
  return `Bearer ${getOpenAIApiKey()}`;
}
