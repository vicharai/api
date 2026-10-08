import { defineCollection, defineConfig } from "@content-collections/core";
import * as z from "zod";

const legal = defineCollection({
	name: "legal",
	directory: "src/content/legal",
	include: "**/*.md",
	schema: z.object({
		id: z.string(),
		slug: z.string(),
		date: z.string(),
		title: z.string(),
		description: z.string(),
	}),
});

export default defineConfig({
	collections: [legal],
});
