"use client";

import Markdown from "markdown-to-jsx";

import { cn } from "@/lib/utils";

/** Renders admin-authored markdown; raw HTML is shown as text, not parsed. */
export function MarkdownPreview({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"text-sm leading-relaxed break-words [&_ol]:my-3 [&_p]:my-3 [&_pre]:my-3 [&_ul]:my-3 [&>div>*:first-child]:mt-0 [&_a]:text-brand [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_hr]:border-border [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc",
				className,
			)}
		>
			<Markdown options={{ disableParsingRawHTML: true, forceBlock: true }}>
				{children}
			</Markdown>
		</div>
	);
}
