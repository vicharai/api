import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { baseOptions } from "@/app/layout.config";
import { AskAI } from "@/components/ai/ask-ai";
import { source } from "@/lib/source";

import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

const docsOptions: DocsLayoutProps = {
	...baseOptions,

	tree: source.pageTree,

	links: [],

	sidebar: {},
};

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout {...docsOptions}>
			{process.env.DOCS_AI_SUPPORT_CHAT_API_KEY ? <AskAI /> : null}
			{children}
		</DocsLayout>
	);
}
