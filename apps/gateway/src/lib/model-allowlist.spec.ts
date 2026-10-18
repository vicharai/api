import { afterEach, describe, expect, it } from "vitest";

import { isModelAllowedByDeployment } from "./model-allowlist.js";

afterEach(() => {
	delete process.env.GATEWAY_MODEL_ALLOWLIST;
});

describe("isModelAllowedByDeployment", () => {
	it("allows everything when the env var is unset or empty", () => {
		delete process.env.GATEWAY_MODEL_ALLOWLIST;
		expect(isModelAllowedByDeployment("gpt-4o")).toBe(true);
		process.env.GATEWAY_MODEL_ALLOWLIST = "  ";
		expect(isModelAllowedByDeployment("gpt-4o")).toBe(true);
	});

	it("matches exact ids", () => {
		process.env.GATEWAY_MODEL_ALLOWLIST =
			"vichar-deepseek-v3.2, vichar-gpt-5.2";
		expect(isModelAllowedByDeployment("vichar-deepseek-v3.2")).toBe(true);
		expect(isModelAllowedByDeployment("vichar-gpt-5.2")).toBe(true);
		expect(isModelAllowedByDeployment("vichar-qwen3-coder")).toBe(false);
		expect(isModelAllowedByDeployment("gpt-4o")).toBe(false);
	});

	it("matches prefix entries with a trailing star", () => {
		process.env.GATEWAY_MODEL_ALLOWLIST = "vichar-*";
		expect(isModelAllowedByDeployment("vichar-space-bunny")).toBe(true);
		expect(isModelAllowedByDeployment("vichar-x")).toBe(true);
		expect(isModelAllowedByDeployment("gpt-4o")).toBe(false);
		// Prefixes match literally — "vicharx" would match "vichar-*" only if it
		// starts with "vichar-", so the dash is part of the prefix.
		expect(isModelAllowedByDeployment("vicharx")).toBe(false);
	});

	it("never blocks the routing pseudo-models", () => {
		process.env.GATEWAY_MODEL_ALLOWLIST = "vichar-*";
		expect(isModelAllowedByDeployment("auto")).toBe(true);
		expect(isModelAllowedByDeployment("smart")).toBe(true);
		expect(isModelAllowedByDeployment("custom")).toBe(true);
	});

	it("prefers an explicitly loaded allowlist over the env var", () => {
		process.env.GATEWAY_MODEL_ALLOWLIST = "vichar-*";
		expect(isModelAllowedByDeployment("gpt-4o", ["gpt-*"])).toBe(true);
		expect(isModelAllowedByDeployment("vichar-x", ["gpt-*"])).toBe(false);
		expect(isModelAllowedByDeployment("vichar-x", [])).toBe(true);
	});
});
