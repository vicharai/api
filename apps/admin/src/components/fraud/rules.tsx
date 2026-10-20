"use client";

import { Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Switch,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Rule = ApiData<"/admin/fraud/rules">["rules"][number];
type RuleTypes = ApiData<"/admin/fraud/rule-types">;
type RuleTypeSpec = RuleTypes["types"][number];
type RuleType = Rule["type"];
type RuleAction = Rule["action"];

const ACTION_LABELS: Record<RuleAction, string> = {
	flag: "Flag (block inference and purchases)",
	suspend_org: "Suspend org (flag, admin confirms)",
	block_org: "Block org (flag, admin confirms)",
	notify: "Notify only",
};

function describeParams(rule: Rule, spec: RuleTypeSpec | undefined) {
	return (spec?.params ?? [])
		.map((p) => `${p.label} ${rule.params[p.key] ?? p.default} ${p.unit}`)
		.join(" · ");
}

export function FraudRules() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const rules = api.useQuery("get", "/admin/fraud/rules");
	const types = api.useQuery("get", "/admin/fraud/rule-types");
	const [editing, setEditing] = useState<Rule | "new" | null>(null);
	const [previewing, setPreviewing] = useState<Rule | null>(null);
	const update = api.useMutation("patch", "/admin/fraud/rules/{id}", {
		onSuccess: () => void invalidate("/admin/fraud/rules"),
	});
	const remove = api.useMutation("delete", "/admin/fraud/rules/{id}", {
		onSuccess: () => {
			toast.success("Rule deleted");
			void invalidate("/admin/fraud/rules");
		},
	});
	const canWrite = can("POST", "/admin/fraud/rules");
	const specOf = (type: RuleType) =>
		types.data?.types.find((t) => t.type === type);

	const columns: ColumnDef<Rule>[] = [
		{
			accessorKey: "name",
			header: "Rule",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">{row.original.name}</div>
					<div className="text-xs text-muted-foreground">
						{specOf(row.original.type)?.label ?? row.original.type} ·{" "}
						{describeParams(row.original, specOf(row.original.type))}
					</div>
				</div>
			),
		},
		{
			accessorKey: "action",
			header: "Action",
			cell: ({ row }) => (
				<Tone tone={row.original.action === "notify" ? "info" : "warn"}>
					{row.original.action.replace(/_/g, " ")}
				</Tone>
			),
		},
		{
			id: "events",
			header: "Open events",
			cell: ({ row }) => (
				<div className="text-sm">
					<Link
						href={`/fraud/events?ruleId=${row.original.id}` as Route}
						className="tabular-nums hover:underline"
					>
						{formatNumber(row.original.openEvents)}
					</Link>
					<div className="text-xs text-muted-foreground">
						last {formatDateTime(row.original.lastEventAt)}
					</div>
				</div>
			),
		},
		{
			accessorKey: "enabled",
			header: "Enabled",
			cell: ({ row }) => (
				<Switch
					checked={row.original.enabled}
					disabled={!canWrite || update.isPending}
					aria-label={`Enable ${row.original.name}`}
					onCheckedChange={(enabled) =>
						update.mutate({
							params: { path: { id: row.original.id } },
							body: { enabled },
						})
					}
				/>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<Button
						size="sm"
						variant="outline"
						onClick={() => setPreviewing(row.original)}
					>
						<Eye /> Preview
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={!canWrite}
						onClick={() => setEditing(row.original)}
					>
						<Pencil /> Edit
					</Button>
					<ConfirmAction
						title={`Delete ${row.original.name}`}
						description="Its past events are kept."
						confirmLabel="Delete"
						destructive
						requireReason={false}
						onConfirm={() =>
							remove.mutateAsync({ params: { path: { id: row.original.id } } })
						}
					>
						<Button size="sm" variant="ghost" disabled={!canWrite}>
							<Trash2 />
						</Button>
					</ConfirmAction>
				</div>
			),
		},
	];

	return (
		<Section
			title="Rules"
			description="Evaluated by the worker every 5 minutes over aggregated stats. Each subject raises at most one event per rule window."
			actions={
				<Button
					size="sm"
					disabled={!canWrite || !types.data}
					onClick={() => setEditing("new")}
				>
					<Plus /> New rule
				</Button>
			}
		>
			<DataTable
				columns={columns}
				data={rules.data?.rules}
				isLoading={rules.isLoading}
				getRowId={(row) => row.id}
				empty="No rules yet."
			/>
			{editing && types.data ? (
				<RuleDialog
					rule={editing === "new" ? undefined : editing}
					types={types.data}
					onClose={() => setEditing(null)}
				/>
			) : null}
			{previewing ? (
				<PreviewDialog rule={previewing} onClose={() => setPreviewing(null)} />
			) : null}
		</Section>
	);
}

function RuleDialog({
	rule,
	types,
	onClose,
}: {
	rule?: Rule;
	types: RuleTypes;
	onClose: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [name, setName] = useState(rule?.name ?? "");
	const [type, setType] = useState<RuleType>(rule?.type ?? types.types[0].type);
	const [action, setAction] = useState<RuleAction>(rule?.action ?? "notify");
	const spec = types.types.find((t) => t.type === type)!;
	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			spec.params.map((p) => [p.key, String(rule?.params[p.key] ?? p.default)]),
		),
	);
	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/fraud/rules");
		onClose();
	};
	const create = api.useMutation("post", "/admin/fraud/rules", {
		onSuccess: done("Rule created"),
	});
	const update = api.useMutation("patch", "/admin/fraud/rules/{id}", {
		onSuccess: done("Rule saved"),
	});
	const pending = create.isPending || update.isPending;

	const params = Object.fromEntries(
		spec.params.map((p) => [p.key, Number(values[p.key] ?? p.default)]),
	);
	const invalid = spec.params.find((p) => {
		const v = params[p.key];
		return !Number.isFinite(v) || v < p.min || v > p.max;
	});
	const valid = name.trim().length > 0 && !invalid;

	function changeType(next: RuleType) {
		const nextSpec = types.types.find((t) => t.type === next)!;
		setType(next);
		setValues(
			Object.fromEntries(
				nextSpec.params.map((p) => [p.key, String(p.default)]),
			),
		);
	}

	function submit() {
		if (rule) {
			update.mutate({
				params: { path: { id: rule.id } },
				body: { name: name.trim(), action, params },
			});
		} else {
			create.mutate({
				body: { name: name.trim(), type, action, params, enabled: true },
			});
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{rule ? `Edit ${rule.name}` : "New fraud rule"}
					</DialogTitle>
					<DialogDescription>{spec.description}</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) {
							submit();
						}
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="rule-name">Name</Label>
						<Input
							id="rule-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label>Type</Label>
							{rule ? (
								<Input disabled value={spec.label} />
							) : (
								<SimpleSelect
									className="w-full"
									value={type}
									onChange={changeType}
									options={types.types.map((t) => ({
										value: t.type,
										label: t.label,
									}))}
								/>
							)}
						</div>
						<div className="space-y-1.5">
							<Label>Action</Label>
							<SimpleSelect
								className="w-full"
								value={action}
								onChange={setAction}
								options={types.actions.map((a) => ({
									value: a,
									label: ACTION_LABELS[a],
								}))}
							/>
						</div>
						{spec.params.map((p) => (
							<div key={p.key} className="space-y-1.5">
								<Label htmlFor={`rule-${p.key}`}>
									{p.label} ({p.unit})
								</Label>
								<Input
									id={`rule-${p.key}`}
									inputMode="decimal"
									value={values[p.key] ?? ""}
									onChange={(e) =>
										setValues((v) => ({ ...v, [p.key]: e.target.value }))
									}
								/>
							</div>
						))}
					</div>
					{invalid ? (
						<p className="text-xs text-destructive">
							{invalid.label} must be between {invalid.min} and {invalid.max}.
						</p>
					) : null}
					<p className="text-xs text-muted-foreground">
						Subjects: {spec.subjectType === "user" ? "users" : "organizations"}.
						Suspend and block only flag automatically; confirm the intended
						action from the event.
					</p>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!valid || pending}>
							{pending ? <Loader2 className="animate-spin" /> : null}
							{rule ? "Save" : "Create rule"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function PreviewDialog({ rule, onClose }: { rule: Rule; onClose: () => void }) {
	const api = useApi();
	const preview = api.useQuery("get", "/admin/fraud/rules/{id}/preview", {
		params: { path: { id: rule.id } },
	});

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Preview: {rule.name}</DialogTitle>
					<DialogDescription>
						Subjects the rule matches right now. Nothing is recorded or changed.
					</DialogDescription>
				</DialogHeader>
				<QueryState query={preview} rows={4}>
					{(data) =>
						data.matches.length === 0 ? (
							<p className="text-sm text-muted-foreground">No matches now.</p>
						) : (
							<ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
								{data.matches.map((m) => (
									<li
										key={`${m.subjectType}:${m.subjectId}`}
										className="rounded border p-2"
									>
										<Link
											href={
												(m.subjectType === "user"
													? `/users/${m.subjectId}`
													: `/organizations/${m.subjectId}`) as Route
											}
											className="font-medium hover:underline"
										>
											{m.label}
										</Link>
										<div className="text-xs text-muted-foreground">
											{Object.entries(m.details)
												.filter(([, v]) => typeof v !== "object")
												.map(([k, v]) => `${k}: ${String(v)}`)
												.join(" · ")}
										</div>
									</li>
								))}
							</ul>
						)
					}
				</QueryState>
			</DialogContent>
		</Dialog>
	);
}
