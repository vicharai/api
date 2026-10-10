export type ProductId = "gateway";

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
};

export const productOrder: ProductId[] = ["gateway"];

export function productForPath(_path: string): Product {
	return products.gateway;
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
