"use client";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useState, type FormEvent } from "react";

import { site } from "@/lib/site";

const TOPICS = [
	{ value: "support", label: "Help with my account or the API" },
	{ value: "billing", label: "Billing" },
	{ value: "sales", label: "Sales and volume pricing" },
	{ value: "partnerships", label: "Partnerships" },
	{ value: "other", label: "Something else" },
] as const;

const SIZES = [
	{ value: "n/a", label: "Prefer not to say" },
	{ value: "1-10", label: "1–10 people" },
	{ value: "11-50", label: "11–50 people" },
	{ value: "51-200", label: "51–200 people" },
	{ value: "200+", label: "200+ people" },
] as const;

const field =
	"h-12 w-full rounded-xl border border-input bg-card px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-g-blue focus:ring-2 focus:ring-ring";
const label = "flex flex-col gap-2 text-sm font-medium text-body";

type State =
	| { kind: "idle" }
	| { kind: "sending" }
	| { kind: "sent" }
	| { kind: "error"; message: string };

export function ContactForm() {
	const [state, setState] = useState<State>({ kind: "idle" });
	const [startedAt] = useState(() => Date.now());

	async function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const data = new FormData(e.currentTarget);
		const text = (name: string) => String(data.get(name) ?? "").trim();
		setState({ kind: "sending" });
		try {
			const res = await fetch(`${site.urls.backend}/public/contact`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: text("name"),
					email: text("email"),
					company: text("company") || undefined,
					topic: text("topic"),
					size: text("size"),
					message: text("message"),
					honeypot: text("website") || undefined,
					clientTimestampMs: startedAt,
				}),
			});
			if (res.ok) {
				setState({ kind: "sent" });
				return;
			}
			setState({
				kind: "error",
				message:
					res.status === 429
						? "Too many messages from your network. Please try again later or email us."
						: "Please check the form and try again.",
			});
		} catch {
			setState({
				kind: "error",
				message: "We couldn't reach our servers. Please try again or email us.",
			});
		}
	}

	if (state.kind === "sent") {
		return (
			<div
				role="status"
				className="flex flex-col items-start gap-4 rounded-[28px] bg-g-green-soft p-8"
			>
				<CheckCircle2 className="size-8 text-g-green-deep" />
				<h2 className="text-[22px] font-medium">Thanks, we got your message</h2>
				<p className="text-[15px] text-body">
					We reply by email, usually within one business day.
				</p>
				<button
					type="button"
					onClick={() => setState({ kind: "idle" })}
					className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-g-blue transition-colors hover:bg-g-blue-soft"
				>
					Send another message
				</button>
			</div>
		);
	}

	return (
		<form
			onSubmit={onSubmit}
			className="relative grid gap-5 rounded-[28px] border border-border bg-card p-5 sm:grid-cols-2 sm:p-8"
		>
			<label className={label}>
				Name
				<input
					name="name"
					required
					maxLength={100}
					autoComplete="name"
					className={field}
				/>
			</label>
			<label className={label}>
				Work email
				<input
					name="email"
					type="email"
					required
					maxLength={254}
					autoComplete="email"
					className={field}
				/>
			</label>
			<label className={label}>
				<span>
					Company{" "}
					<span className="font-normal text-muted-foreground">(optional)</span>
				</span>
				<input
					name="company"
					maxLength={140}
					autoComplete="organization"
					className={field}
				/>
			</label>
			<label className={label}>
				Team size
				<select name="size" defaultValue="n/a" className={field}>
					{SIZES.map((s) => (
						<option key={s.value} value={s.value}>
							{s.label}
						</option>
					))}
				</select>
			</label>
			<label className={`${label} sm:col-span-2`}>
				Topic
				<select name="topic" defaultValue="support" className={field}>
					{TOPICS.map((t) => (
						<option key={t.value} value={t.value}>
							{t.label}
						</option>
					))}
				</select>
			</label>
			<label className={`${label} sm:col-span-2`}>
				Message
				<textarea
					name="message"
					required
					maxLength={5000}
					rows={6}
					className={`${field} h-auto min-h-36 resize-y py-3`}
				/>
			</label>
			<div
				aria-hidden="true"
				className="absolute -left-[9999px] h-px w-px overflow-hidden"
			>
				<label>
					Website
					<input name="website" tabIndex={-1} autoComplete="off" />
				</label>
			</div>
			<div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-xs text-muted-foreground">
					Already a customer? Open a conversation from{" "}
					<a
						href={`${site.urls.app}/dashboard/support`}
						className="text-g-blue hover:underline"
					>
						Help & support
					</a>{" "}
					in your dashboard.
				</p>
				<button
					type="submit"
					disabled={state.kind === "sending"}
					className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-[background-color,box-shadow] hover:bg-brand-strong hover:shadow-[0_1px_3px_1px_rgb(60_64_67/0.15)] disabled:opacity-60"
				>
					{state.kind === "sending" ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Send className="size-4" />
					)}
					Send message
				</button>
			</div>
			{state.kind === "error" ? (
				<p role="alert" className="text-sm text-destructive sm:col-span-2">
					{state.message}
				</p>
			) : null}
		</form>
	);
}
