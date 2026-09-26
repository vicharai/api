import { Buffer } from "node:buffer";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchModelsResponseFromApi } from "./api-types";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("fetchModelsResponseFromApi", () => {
	it("bypasses Next's data cache for oversized catalogues", async () => {
		const body = JSON.stringify({
			models: [{ id: "large-model", description: "x".repeat(2 * 1024 * 1024) }],
		});
		expect(Buffer.byteLength(body)).toBeGreaterThan(2 * 1024 * 1024);

		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(body));

		const response = await fetchModelsResponseFromApi(
			"https://api.example.com",
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.example.com/internal/models",
			{ cache: "no-store" },
		);
		expect(await response.text()).toBe(body);
	});

	it("appends configuredOnly when requested", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("{}"));

		await fetchModelsResponseFromApi("https://api.example.com", {
			configuredOnly: true,
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.example.com/internal/models?configuredOnly=true",
			{ cache: "no-store" },
		);
	});
});
