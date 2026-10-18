"use client";

import { Check, Copy } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";

/** Copies an ID (or any short value) to the clipboard. */
export function CopyIdButton({
	value,
	label = "ID",
	showValue = false,
	className,
}: {
	value: string;
	label?: string;
	showValue?: boolean;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	async function copy(event: MouseEvent) {
		event.stopPropagation();
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			toast.success(`${label} copied`);
			setTimeout(() => setCopied(false), 1500);
		} catch (error) {
			console.error(error);
			toast.error(`Could not copy ${label}`);
		}
	}

	return (
		<Button
			type="button"
			variant="ghost"
			size={showValue ? "sm" : "icon-sm"}
			className={cn(
				showValue && "h-7 max-w-full gap-1.5 px-2 font-mono text-xs",
				className,
			)}
			aria-label={`Copy ${label}`}
			title={`Copy ${label}: ${value}`}
			onClick={copy}
		>
			{showValue ? <span className="truncate">{value}</span> : null}
			{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
		</Button>
	);
}
