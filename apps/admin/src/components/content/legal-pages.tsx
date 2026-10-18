"use client";

import { Loader2, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Segmented, Tone } from "@/components/ui/controls";
import { PageHeader, QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import { Button, Textarea } from "@llmgateway/shared/components";

import { MarkdownPreview } from "./markdown-preview";

import type { LegalPage } from "@/lib/api/admin-types";

const PAGES = [
	{ value: "terms", label: "Terms of use" },
	{ value: "privacy", label: "Privacy policy" },
] as const;

type PageId = (typeof PAGES)[number]["value"];

export function LegalPagesEditor() {
	const api = useApi();
	const [filters, setFilters] = useUrlFilters({ page: "terms" });
	const page: PageId = filters.page === "privacy" ? "privacy" : "terms";
	const content = api.useQuery("get", "/admin/content/legal/{page}", {
		params: { path: { page } },
	});

	return (
		<>
			<PageHeader
				title="Legal pages"
				description="The terms and privacy policy shown on the dashboard. Unedited pages use the bundled text."
				actions={
					<Segmented
						ariaLabel="Page"
						value={page}
						onChange={(next) => setFilters({ page: next })}
						options={PAGES}
					/>
				}
			/>
			<QueryState query={content} rows={8}>
				{(data) => (
					<LegalEditor
						key={`${data.page}:${data.updatedAt ?? ""}`}
						content={data}
					/>
				)}
			</QueryState>
		</>
	);
}

function LegalEditor({ content }: { content: LegalPage }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const initial = content.markdown ?? content.defaultMarkdown ?? "";
	const [markdown, setMarkdown] = useState(initial);
	const path = { page: content.page };
	const editable = can("PUT", `/admin/content/legal/${content.page}`);
	const customized = content.markdown !== null;
	const save = api.useMutation("put", "/admin/content/legal/{page}", {
		onSuccess: () => {
			toast.success("Page saved");
			void invalidate("/admin/content/legal");
		},
	});

	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<Section
				title="Markdown"
				description={
					customized ? (
						<>
							<Tone tone="info">customized</Tone> updated{" "}
							{formatDateTime(content.updatedAt)}
						</>
					) : (
						"Using the bundled text."
					)
				}
				actions={
					<>
						{customized ? (
							<ConfirmAction
								title="Reset to default"
								description="Discards the customized page; the bundled text is shown again."
								confirmLabel="Reset"
								requireReason={false}
								onConfirm={() =>
									save.mutateAsync({
										params: { path },
										body: { markdown: null },
									})
								}
							>
								<Button size="sm" variant="ghost" disabled={!editable}>
									<RotateCcw /> Reset
								</Button>
							</ConfirmAction>
						) : null}
						<Button
							size="sm"
							disabled={
								!editable ||
								markdown === initial ||
								!markdown.trim() ||
								save.isPending
							}
							onClick={() =>
								save.mutate({
									params: { path },
									body: {
										markdown:
											markdown === content.defaultMarkdown ? null : markdown,
									},
								})
							}
						>
							{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
							Save
						</Button>
					</>
				}
			>
				<Textarea
					aria-label="Markdown"
					rows={28}
					className="font-mono text-xs"
					disabled={!editable}
					value={markdown}
					onChange={(e) => setMarkdown(e.target.value)}
				/>
			</Section>
			<Section title="Preview">
				<div className="max-h-[42rem] overflow-y-auto">
					<MarkdownPreview>{markdown}</MarkdownPreview>
				</div>
			</Section>
		</div>
	);
}
