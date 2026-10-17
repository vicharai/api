"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import {
	Input,
	Label,
	SearchableSelect,
	type SearchableSelectOption,
} from "@llmgateway/shared/components";

import type { RoutingOverrideScope } from "@/lib/api/pending-paths-p2";

type Expiry = "never" | "1h" | "6h" | "24h" | "7d" | "custom";

const EXPIRY_HOURS: Record<Exclude<Expiry, "never" | "custom">, number> = {
	"1h": 1,
	"6h": 6,
	"24h": 24,
	"7d": 168,
};

const SCOPES: { value: RoutingOverrideScope; label: string }[] = [
	{ value: "provider", label: "Whole provider" },
	{ value: "model", label: "Model (every provider)" },
	{ value: "mapping", label: "One provider/model mapping" },
];

function expiresAtFor(expiry: Expiry, custom: string): string | undefined {
	if (expiry === "never") {
		return undefined;
	}
	if (expiry === "custom") {
		const date = new Date(custom);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}
	const durationMs = EXPIRY_HOURS[expiry] * 3_600_000;
	return new Date(Date.now() + durationMs).toISOString();
}

/**
 * Disables a provider, model or mapping at the gateway. Routing skips every
 * matching mapping until the switch is removed or expires.
 */
export function CreateKillSwitchDialog({
	children,
	open,
	onOpenChange,
	defaultScope = "provider",
	defaultTarget = "",
}: {
	children?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultScope?: RoutingOverrideScope;
	defaultTarget?: string;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [scope, setScope] = useState<RoutingOverrideScope>(defaultScope);
	const [target, setTarget] = useState(defaultTarget);
	const [expiry, setExpiry] = useState<Expiry>("never");
	const [custom, setCustom] = useState("");

	const options = api.useQuery("get", "/admin/rate-limits/options");
	const create = api.useMutation("post", "/admin/routing-overrides", {
		onSuccess: (res) => {
			toast.success(`Disabled ${res.override.scope} ${res.override.target}`);
			setTarget("");
			setExpiry("never");
			void invalidate("/admin/routing-overrides");
		},
	});

	const mappings = options.data?.mappings ?? [];
	const targetOptions: SearchableSelectOption[] =
		scope === "provider"
			? (options.data?.providers ?? []).map((p) => ({
					value: p.id,
					label: p.name,
					keywords: p.id,
				}))
			: scope === "model"
				? [...new Set(mappings.map((m) => m.modelId))]
						.sort()
						.map((id) => ({ value: id, label: id }))
				: mappings.map((m) => ({
						value: `${m.providerId}/${m.modelId}`,
						label: `${m.providerId}/${m.modelId}`,
						keywords: `${m.providerName} ${m.modelName}`,
					}));

	const invalidExpiry =
		expiry === "custom" && Number.isNaN(new Date(custom).getTime());

	return (
		<ConfirmAction
			title="Create kill switch"
			description="Routing skips every matching mapping immediately. Pinned requests to a disabled target fail instead of routing elsewhere."
			confirmLabel="Disable"
			destructive
			open={open}
			onOpenChange={onOpenChange}
			confirmDisabled={!target || invalidExpiry}
			extra={
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label>Scope</Label>
						<SimpleSelect
							className="w-full"
							value={scope}
							onChange={(next) => {
								setScope(next);
								setTarget("");
							}}
							options={SCOPES}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Target</Label>
						<SearchableSelect
							value={target}
							onValueChange={setTarget}
							options={targetOptions}
							placeholder={options.isLoading ? "Loading…" : `Pick a ${scope}`}
							aria-label="Target"
						/>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1.5">
							<Label>Expires</Label>
							<SimpleSelect
								className="w-full"
								value={expiry}
								onChange={setExpiry}
								options={[
									{ value: "never", label: "Never" },
									{ value: "1h", label: "In 1 hour" },
									{ value: "6h", label: "In 6 hours" },
									{ value: "24h", label: "In 24 hours" },
									{ value: "7d", label: "In 7 days" },
									{ value: "custom", label: "Custom…" },
								]}
							/>
						</div>
						{expiry === "custom" ? (
							<div className="space-y-1.5">
								<Label htmlFor="kill-switch-expiry">At (local time)</Label>
								<Input
									id="kill-switch-expiry"
									type="datetime-local"
									value={custom}
									onChange={(e) => setCustom(e.target.value)}
								/>
							</div>
						) : null}
					</div>
				</div>
			}
			onConfirm={(reason) =>
				create.mutateAsync({
					body: {
						scope,
						target,
						reason,
						expiresAt: expiresAtFor(expiry, custom),
					},
				})
			}
		>
			{children}
		</ConfirmAction>
	);
}
