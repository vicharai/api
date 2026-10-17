"use client";

import { X } from "lucide-react";

import {
	Badge,
	SearchableSelect,
	type SearchableSelectOption,
} from "@llmgateway/shared/components";

/** Multi-select as removable chips plus a searchable "add" box. */
export function ChipPicker({
	values,
	onChange,
	options,
	placeholder,
	disabled,
}: {
	values: string[];
	onChange: (values: string[]) => void;
	options: SearchableSelectOption[];
	placeholder: string;
	disabled?: boolean;
}) {
	const remaining = options.filter((o) => !values.includes(o.value));
	return (
		<div className="space-y-2">
			<div className="flex min-h-9 flex-wrap gap-1.5">
				{values.length === 0 ? (
					<span className="text-sm text-muted-foreground">None</span>
				) : (
					values.map((value) => (
						<Badge key={value} variant="secondary" className="gap-1 pr-1">
							{options.find((o) => o.value === value)?.label ?? value}
							<button
								type="button"
								aria-label={`Remove ${value}`}
								disabled={disabled}
								className="rounded-sm p-0.5 hover:bg-background/60"
								onClick={() => onChange(values.filter((v) => v !== value))}
							>
								<X className="size-3" />
							</button>
						</Badge>
					))
				)}
			</div>
			<SearchableSelect
				value=""
				disabled={disabled}
				placeholder={placeholder}
				options={remaining}
				onValueChange={(value) => {
					if (value && !values.includes(value)) {
						onChange([...values, value]);
					}
				}}
			/>
		</div>
	);
}
