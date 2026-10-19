import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { Env } from "../types";

const AI_SETTINGS_KEY = "settings/ai.json";
export const MODEL_ID_PATTERN = /^~?[a-z0-9][\w.-]*\/[\w.:-]+$/i;

export function defaultModel(env: Env): string {
	return env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
}

// The model picked in Settings wins over OPENROUTER_MODEL.
export async function getModelId(env: Env): Promise<string> {
	const saved = await env.BUCKET.get(AI_SETTINGS_KEY);
	const model = saved ? (await saved.json<{ model?: string }>()).model : undefined;
	return model || defaultModel(env);
}

export async function saveModelId(env: Env, model: string | null): Promise<void> {
	if (model) await env.BUCKET.put(AI_SETTINGS_KEY, JSON.stringify({ model }));
	else await env.BUCKET.delete(AI_SETTINGS_KEY);
}

export async function getLanguageModel(env: Env): Promise<LanguageModel> {
	if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for AI features.");
	const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
	return openrouter.chat(await getModelId(env));
}
