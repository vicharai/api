"use client";

import { Eraser } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PageHeader, Section } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";

import { Button, Input, Label } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { CacheScope } from "@/lib/api/pending-paths-p2";

const TOOLS: {
	scope: CacheScope;
	title: string;
	description: string;
	target?: { label: string; placeholder: string; required: boolean };
}[] = [
	{
		scope: "organization",
		title: "Organization cache",
		description:
			"Drops the cached organization row (plan, credits, status, provider access) so the gateway reloads it on the next request.",
		target: { label: "Organization ID", placeholder: "org id", required: true },
	},
	{
		scope: "apiKey",
		title: "API key cache",
		description:
			"Drops a cached API key so status or limit changes take effect immediately.",
		target: { label: "API key ID", placeholder: "key id", required: true },
	},
	{
		scope: "settings",
		title: "Settings cache",
		description:
			"Reloads platform settings (banner, maintenance, signup rules, kill switches) everywhere.",
	},
	{
		scope: "responseCache",
		title: "Response cache",
		description:
			"Flushes cached completions. Leave the target empty to flush everything.",
		target: {
			label: "Organization or model ID (optional)",
			placeholder: "org id or model id",
			required: false,
		},
	},
];

export function CacheToolsPage() {
	return (
		<>
			<PageHeader
				title="Cache tools"
				description="Force the gateway to pick up a change now instead of after the cache interval. Every flush is audit-logged."
			/>
			<div className="grid gap-4 lg:grid-cols-2">
				{TOOLS.map((tool) => (
					<CacheTool key={tool.scope} tool={tool} />
				))}
			</div>
		</>
	);
}

function CacheTool({ tool }: { tool: (typeof TOOLS)[number] }) {
	const api = useApi();
	const can = useCan();
	const [targetId, setTargetId] = useState("");
	const invalidate = api.useMutation("post", "/admin/cache/invalidate", {
		onSuccess: (res) => {
			toast.success(
				res.cleared === null
					? `${tool.title} invalidated`
					: `${tool.title}: cleared ${formatNumber(res.cleared)} entr${res.cleared === 1 ? "y" : "ies"}`,
			);
			setTargetId("");
		},
	});
	const target = targetId.trim();
	const missingTarget = Boolean(tool.target?.required) && !target;
	const flushAll = tool.scope === "responseCache" && !target;

	return (
		<Section title={tool.title} description={tool.description}>
			<div className="flex flex-wrap items-end gap-2">
				{tool.target ? (
					<div className="min-w-48 flex-1 space-y-1.5">
						<Label htmlFor={`cache-${tool.scope}`}>{tool.target.label}</Label>
						<Input
							id={`cache-${tool.scope}`}
							className="font-mono"
							value={targetId}
							placeholder={tool.target.placeholder}
							onChange={(e) => setTargetId(e.target.value)}
						/>
					</div>
				) : null}
				<ConfirmAction
					title={`Invalidate ${tool.title.toLowerCase()}`}
					description={
						flushAll
							? "Flushes every cached response. Expect a short spike in upstream traffic and cost."
							: tool.description
					}
					confirmLabel="Invalidate"
					destructive={flushAll}
					requireReason={false}
					onConfirm={() =>
						invalidate.mutateAsync({
							body: { scope: tool.scope, targetId: target || undefined },
						})
					}
				>
					<Button
						variant="outline"
						disabled={missingTarget || !can("POST", "/admin/cache/invalidate")}
					>
						<Eraser /> Invalidate
					</Button>
				</ConfirmAction>
			</div>
		</Section>
	);
}
