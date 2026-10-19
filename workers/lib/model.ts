import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { Env } from "../types";

export function getLanguageModel(env: Env): LanguageModel {
	if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for AI features.");
	const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
	return openrouter.chat(env.OPENROUTER_MODEL || "openai/gpt-4.1-mini");
}
