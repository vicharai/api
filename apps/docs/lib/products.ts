export type ProductId = "gateway" | "devpass";

export interface Product {
	id: ProductId;
	name: string;
	tagline: string;
	docsUrl: string;
	appUrl: string;
	appLabel: string;
	accent: string;
}

export const products: Record<ProductId, Product> = {
	gateway: {
		id: "gateway",
		name: "Vichar",
		tagline: "One OpenAI-compatible API for every model and provider.",
		docsUrl: "/",
		appUrl: "https://app.vichar.io/dashboard",
		appLabel: "Open dashboard",
		accent: "#3b82f6",
	},
	devpass: {
		id: "devpass",
		name: "DevPass",
		tagline:
			"Flat monthly plans for Claude Code, Cursor, and every coding agent.",
		docsUrl: "/devpass",
		appUrl: "https://devpass.vichar.io/dashboard",
		appLabel: "Open DevPass",
		accent: "#10b981",
	},
};

export const productOrder: ProductId[] = ["gateway", "devpass"];

export function productForPath(path: string): Product {
	const group = /^\((gateway|devpass)\)\//.exec(path)?.[1];
	return products[(group as ProductId | undefined) ?? "gateway"];
}

const sectionLabels: Record<string, string> = {
	features: "Features",
	learn: "Knowledge base",
	guides: "Guides",
	developers: "Developer tools",
	resources: "Resources",
	integrations: "Integrations",
	migrations: "Migrations",
	"self-host": "Self-hosting",
};

export function sectionForPath(path: string): string {
	const segments = path.split("/").filter((s) => !/^\(.+\)$/.test(s));
	if (path.includes("(api)/")) {
		return "API reference";
	}
	if (segments.length > 1) {
		return sectionLabels[segments[0]] ?? "Docs";
	}
	return "Get started";
}
