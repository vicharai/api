// Internal routing providers render with a user-facing label so raw provider
// IDs never leak into the UI.
const PROVIDER_LABELS: Record<string, string> = {
	openrouter: "vichar",
};

export function providerLabel(id: string | null | undefined): string {
	return PROVIDER_LABELS[id ?? ""] ?? id ?? "";
}

// `usedModel` can carry an internal `provider/` prefix; customers see only the
// catalogue model ID.
export function displayModelId(model: string | null | undefined): string {
	const m = model ?? "";
	return m.includes("/") ? m.split("/").slice(1).join("/") : m;
}
