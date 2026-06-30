import { google } from "@ai-sdk/google";

export function getGeminiModel(modelId = "gemini-1.5-flash") {
  return google(modelId);
}
