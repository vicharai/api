import { platformConfigValue } from "@llmgateway/shared";

import type { BaseMessage, MessageContent } from "@llmgateway/models";
import type { PlatformConfig } from "@llmgateway/shared";

export type ContentFilterMode = "disabled" | "monitor" | "enabled";
export type ContentFilterMethod = "keywords" | "openai" | "jev";

/**
 * `contentFilter.mode`: "disabled" (default) is off, "monitor" checks and logs
 * without blocking, "enabled" acts on matches. The legacy env value "openai"
 * means enabled with the openai method.
 */
export function getContentFilterMode(
	config?: PlatformConfig,
): ContentFilterMode {
	return platformConfigValue("contentFilter.mode", config) as ContentFilterMode;
}

/**
 * `contentFilter.method`: "keywords" (default) uses the keyword list, "openai"
 * OpenAI moderation, "jev" TypeSafe's Jev model (image parts still go to
 * OpenAI).
 */
export function getContentFilterMethod(
	config?: PlatformConfig,
): ContentFilterMethod {
	return platformConfigValue(
		"contentFilter.method",
		config,
	) as ContentFilterMethod;
}

/**
 * Lowercased model ids the filter applies to (`contentFilter.models`), or null
 * when it applies to all models.
 */
export function getContentFilterModels(
	config?: PlatformConfig,
): string[] | null {
	const models = platformConfigValue("contentFilter.models", config)
		.map((model) => model.trim().toLowerCase())
		.filter((model) => model.length > 0);
	return models.length > 0 ? models : null;
}

export function shouldApplyContentFilterToModel(
	requestedModel: string,
	config?: PlatformConfig,
): boolean {
	const filterModels = getContentFilterModels(config);

	if (filterModels === null) {
		return true;
	}

	return filterModels.includes(requestedModel.trim().toLowerCase());
}

/** Blocked keywords (`contentFilter.keywords`), lowercased for matching. */
function getFilterKeywords(config?: PlatformConfig): string[] {
	return platformConfigValue("contentFilter.keywords", config)
		.map((k) => k.trim().toLowerCase())
		.filter((k) => k.length > 0);
}

function extractTextFromContent(
	content: string | MessageContent[] | null | undefined,
): string {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((part) => {
			if ("text" in part && typeof part.text === "string") {
				return part.text;
			}
			return "";
		})
		.join(" ");
}

/**
 * Checks if any message content contains a blocked keyword.
 * Returns the first matched keyword, or null if no match.
 */
export function checkContentFilter(
	messages: BaseMessage[],
	config?: PlatformConfig,
): string | null {
	const keywords = getFilterKeywords(config);

	if (keywords.length === 0) {
		return null;
	}

	for (const message of messages) {
		const text = extractTextFromContent(message.content).toLowerCase();

		for (const keyword of keywords) {
			if (text.includes(keyword)) {
				return keyword;
			}
		}
	}

	return null;
}
