"use client";

import { SimpleSelect } from "@/components/ui/controls";

import { Input, Label, Textarea } from "@llmgateway/shared/components";

import { PRIORITIES, SEGMENTS, STAGES } from "./crm-shared";

import type {
	CrmAccount,
	CrmAccountBody,
	CrmPriority,
	CrmSegment,
	CrmStage,
} from "@/lib/api/pending-paths";

export interface AccountFormState {
	name: string;
	domain: string;
	segment: CrmSegment;
	stage: CrmStage;
	priority: CrmPriority;
	dealValue: string;
	annualContractValue: string;
	expectedCloseDate: string;
	notes: string;
}

export function toAccountForm(account?: CrmAccount): AccountFormState {
	return {
		name: account?.name ?? "",
		domain: account?.domain ?? "",
		segment: account?.segment ?? "smb",
		stage: account?.stage ?? "lead",
		priority: account?.priority ?? "medium",
		dealValue: account?.dealValue ?? "",
		annualContractValue: account?.annualContractValue ?? "",
		expectedCloseDate: account?.expectedCloseDate?.slice(0, 10) ?? "",
		notes: account?.notes ?? "",
	};
}

export function toAccountBody(form: AccountFormState): CrmAccountBody {
	return {
		name: form.name.trim(),
		domain: form.domain.trim() || null,
		segment: form.segment,
		stage: form.stage,
		priority: form.priority,
		dealValue: form.dealValue.trim() || null,
		annualContractValue: form.annualContractValue.trim() || null,
		expectedCloseDate: form.expectedCloseDate || null,
		notes: form.notes.trim() || null,
	};
}

export function AccountFields({
	form,
	onChange,
	disabled,
}: {
	form: AccountFormState;
	onChange: (form: AccountFormState) => void;
	disabled?: boolean;
}) {
	const set = <K extends keyof AccountFormState>(
		key: K,
		value: AccountFormState[K],
	) => onChange({ ...form, [key]: value });

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<div className="space-y-1.5">
				<Label htmlFor="acc-name">Account name</Label>
				<Input
					id="acc-name"
					disabled={disabled}
					value={form.name}
					onChange={(e) => set("name", e.target.value)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="acc-domain">Domain</Label>
				<Input
					id="acc-domain"
					disabled={disabled}
					placeholder="example.com"
					value={form.domain}
					onChange={(e) => set("domain", e.target.value)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Stage</Label>
				<SimpleSelect
					className="w-full"
					value={form.stage}
					onChange={(v) => set("stage", v)}
					options={STAGES}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-1.5">
					<Label>Segment</Label>
					<SimpleSelect
						className="w-full"
						value={form.segment}
						onChange={(v) => set("segment", v)}
						options={SEGMENTS}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Priority</Label>
					<SimpleSelect
						className="w-full"
						value={form.priority}
						onChange={(v) => set("priority", v)}
						options={PRIORITIES}
					/>
				</div>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="acc-deal">Deal value (USD)</Label>
				<Input
					id="acc-deal"
					type="number"
					disabled={disabled}
					value={form.dealValue}
					onChange={(e) => set("dealValue", e.target.value)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="acc-acv">Annual contract value (USD)</Label>
				<Input
					id="acc-acv"
					type="number"
					disabled={disabled}
					value={form.annualContractValue}
					onChange={(e) => set("annualContractValue", e.target.value)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="acc-close">Expected close</Label>
				<Input
					id="acc-close"
					type="date"
					disabled={disabled}
					value={form.expectedCloseDate}
					onChange={(e) => set("expectedCloseDate", e.target.value)}
				/>
			</div>
			<div className="space-y-1.5 sm:col-span-2">
				<Label htmlFor="acc-notes">Notes</Label>
				<Textarea
					id="acc-notes"
					rows={3}
					disabled={disabled}
					value={form.notes}
					onChange={(e) => set("notes", e.target.value)}
				/>
			</div>
		</div>
	);
}
