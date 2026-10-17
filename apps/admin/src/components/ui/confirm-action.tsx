"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Label,
	Textarea,
} from "@llmgateway/shared/components";

interface ConfirmActionProps {
	title: string;
	description?: ReactNode;
	confirmLabel?: string;
	destructive?: boolean;
	/** Require a free-text reason; it is passed to `onConfirm` and recorded in the audit log. */
	requireReason?: boolean;
	/** Extra form fields rendered above the reason box. */
	extra?: ReactNode;
	/** Disables confirming (e.g. invalid extra fields). */
	confirmDisabled?: boolean;
	onConfirm: (reason: string) => Promise<unknown>;
	/** Trigger element; omit and pass `open`/`onOpenChange` to control it. */
	children?: ReactNode;
	disabled?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	wide?: boolean;
}

/**
 * Every destructive admin action goes through this dialog, which asks for a
 * reason so the audit trail explains why a change was made.
 */
export function ConfirmAction({
	title,
	description,
	confirmLabel = "Confirm",
	destructive = false,
	requireReason = true,
	extra,
	confirmDisabled,
	onConfirm,
	children,
	disabled,
	open: controlledOpen,
	onOpenChange,
	wide,
}: ConfirmActionProps) {
	const [localOpen, setLocalOpen] = useState(false);
	const open = controlledOpen ?? localOpen;
	const setOpen = (next: boolean) => {
		setLocalOpen(next);
		onOpenChange?.(next);
	};
	const [reason, setReason] = useState("");
	const [pending, setPending] = useState(false);

	const reasonMissing = requireReason && reason.trim().length < 3;

	async function confirm() {
		setPending(true);
		try {
			await onConfirm(reason.trim());
			setOpen(false);
			setReason("");
		} catch (error) {
			// Mutation errors are already toasted by the QueryClient; keep the
			// dialog open so the admin can retry.
			console.error(error);
		} finally {
			setPending(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!pending) {
					setOpen(next);
				}
			}}
		>
			{children ? (
				<DialogTrigger asChild disabled={disabled}>
					{children}
				</DialogTrigger>
			) : null}
			<DialogContent className={wide ? "sm:max-w-2xl" : "sm:max-w-md"}>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				<div className="space-y-4">
					{extra}
					{requireReason ? (
						<div className="space-y-1.5">
							<Label htmlFor="confirm-reason">Reason</Label>
							<Textarea
								id="confirm-reason"
								placeholder="Why are you doing this? Recorded in the audit log."
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								rows={3}
								maxLength={500}
							/>
						</div>
					) : null}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={pending}
					>
						Cancel
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						onClick={confirm}
						disabled={pending || reasonMissing || confirmDisabled}
					>
						{pending ? <Loader2 className="animate-spin" /> : null}
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
