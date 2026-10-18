"use client";

import { Loader2, Mail } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { useApi } from "@/lib/fetch-client";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
	Label,
	Textarea,
} from "@llmgateway/shared/components";

export function SendEmailForm({
	defaultTo = "",
	defaultSubject = "",
	onSent,
}: {
	defaultTo?: string;
	defaultSubject?: string;
	onSent?: () => void;
}) {
	const api = useApi();
	const can = useCan();
	const [to, setTo] = useState(defaultTo);
	const [subject, setSubject] = useState(defaultSubject);
	const [body, setBody] = useState("");
	const send = api.useMutation("post", "/admin/send-email", {
		onSuccess: () => {
			toast.success(`Email sent to ${to}`);
			setBody("");
			onSent?.();
		},
	});

	const valid = /\S+@\S+\.\S+/.test(to) && subject.trim() && body.trim();

	return (
		<form
			className="space-y-3"
			onSubmit={(e) => {
				e.preventDefault();
				send.mutate({ body: { to, subject, body } });
			}}
		>
			<div className="space-y-1.5">
				<Label htmlFor="email-to">To</Label>
				<Input
					id="email-to"
					type="email"
					value={to}
					onChange={(e) => setTo(e.target.value)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="email-subject">Subject</Label>
				<Input
					id="email-subject"
					value={subject}
					onChange={(e) => setSubject(e.target.value)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="email-body">Message</Label>
				<Textarea
					id="email-body"
					rows={8}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					placeholder="Plain text. Sent from the support address."
				/>
			</div>
			<Button
				type="submit"
				disabled={!valid || send.isPending || !can("POST", "/admin/send-email")}
			>
				{send.isPending ? <Loader2 className="animate-spin" /> : <Mail />}
				Send email
			</Button>
		</form>
	);
}

export function SendEmailDialog({
	to,
	subject,
	children,
}: {
	to: string;
	subject?: string;
	children?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<Button variant="outline" size="sm">
						<Mail /> Email
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Send email</DialogTitle>
					<DialogDescription>
						Sends a one-off message. It is recorded in the audit log.
					</DialogDescription>
				</DialogHeader>
				<SendEmailForm
					defaultTo={to}
					defaultSubject={subject}
					onSent={() => setOpen(false)}
				/>
				<DialogFooter />
			</DialogContent>
		</Dialog>
	);
}
