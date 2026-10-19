// Upstream provider identities are internal to the platform — every provider
// id renders as the platform label so raw provider names never leak into the
// UI (activity rows, log details, model views, filters).
export function providerLabel(id: string | null | undefined): string {
	return id ? "vichar" : "";
}

// `usedModel` can carry an internal `provider/` prefix; customers see only the
// catalogue model ID.
export function displayModelId(model: string | null | undefined): string {
	const m = model ?? "";
	return m.includes("/") ? m.split("/").slice(1).join("/") : m;
}
