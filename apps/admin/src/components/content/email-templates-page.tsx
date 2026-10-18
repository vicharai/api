"use client";

import { Loader2, RotateCcw, Save, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAdminSession, useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tone } from "@/components/ui/controls";
import { PageHeader, QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import { Button, Input, Label, Textarea } from "@llmgateway/shared/components";

import { MarkdownPreview } from "./markdown-preview";

import type { EmailTemplate } from "@/lib/api/admin-types";

const SAMPLES: Record<string, string> = {
	name: "Ada Lovelace",
	userName: "Ada Lovelace",
	email: "ada@example.com",
	userEmail: "ada@example.com",
	organizationName: "Analytical Engines Ltd",
	orgName: "Analytical Engines Ltd",
	companyName: "Vichar",
	supportEmail: "support@example.com",
	amount: "$25.00",
	balance: "$4.20",
	threshold: "$5.00",
	creditAmount: "$25.00",
	date: "Oct 18, 2026",
	url: "https://example.com/link",
	link: "https://example.com/link",
	dashboardUrl: "https://example.com/dashboard",
	verificationUrl: "https://example.com/verify?token=…",
	resetUrl: "https://example.com/reset?token=…",
	invoiceUrl: "https://example.com/invoice/123",
	reason: "Card declined",
	errorMessage: "Card declined",
};

function sample(variable: string) {
	return SAMPLES[variable] ?? `[${variable}]`;
}

/** Replaces `{{ var }}` placeholders with sample data. */
export function renderTemplate(text: string) {
	return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) =>
		sample(name),
	);
}

export function EmailTemplatesPage() {
	const api = useApi();
	const list = api.useQuery("get", "/admin/content/email-templates");
	const [filters, setFilters] = useUrlFilters({ template: "" });

	return (
		<>
			<PageHeader
				title="Email templates"
				description="Subjects and markdown bodies of the emails the platform sends. Unedited templates use the built-in copy."
			/>
			<QueryState query={list}>
				{(data) => {
					const selected =
						data.templates.find((t) => t.id === filters.template) ??
						data.templates[0];
					return (
						<div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
							<nav className="flex gap-1 overflow-x-auto lg:flex-col">
								{data.templates.map((t) => (
									<button
										key={t.id}
										type="button"
										onClick={() => setFilters({ template: t.id })}
										className={cn(
											"flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap hover:bg-muted",
											t.id === selected?.id && "bg-muted font-medium",
										)}
									>
										{t.label}
										{t.subject !== null || t.body !== null ? (
											<Tone tone="info">edited</Tone>
										) : null}
									</button>
								))}
							</nav>
							{selected ? (
								<TemplateEditor
									key={`${selected.id}:${selected.subject}:${selected.body}`}
									template={selected}
								/>
							) : null}
						</div>
					);
				}}
			</QueryState>
		</>
	);
}

function TemplateEditor({ template }: { template: EmailTemplate }) {
	const api = useApi();
	const can = useCan();
	const { email } = useAdminSession();
	const invalidate = useInvalidate();
	const initialSubject = template.subject ?? template.defaultSubject;
	const initialBody = template.body ?? template.defaultBody;
	const [subject, setSubject] = useState(initialSubject);
	const [body, setBody] = useState(initialBody);
	const path = { id: template.id };
	const editable = can("PUT", `/admin/content/email-templates/${template.id}`);
	const customized = template.subject !== null || template.body !== null;
	const dirty = subject !== initialSubject || body !== initialBody;

	const save = api.useMutation("put", "/admin/content/email-templates/{id}", {
		onSuccess: () => {
			toast.success("Template saved");
			void invalidate("/admin/content/email-templates");
		},
	});
	const test = api.useMutation(
		"post",
		"/admin/content/email-templates/{id}/test",
		{ onSuccess: () => toast.success(`Test email sent to ${email}`) },
	);

	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<Section
				title={template.label}
				description={
					customized ? "Customized copy." : "Using the built-in copy."
				}
				actions={
					<>
						{customized ? (
							<ConfirmAction
								title="Reset to default"
								description="Discards the customized subject and body; the built-in copy is sent again."
								confirmLabel="Reset"
								requireReason={false}
								onConfirm={() =>
									save.mutateAsync({
										params: { path },
										body: { subject: null, body: null },
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
								!dirty ||
								save.isPending ||
								!subject.trim() ||
								!body.trim()
							}
							onClick={() =>
								save.mutate({
									params: { path },
									body: {
										subject:
											subject === template.defaultSubject ? null : subject,
										body: body === template.defaultBody ? null : body,
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
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="tpl-subject">Subject</Label>
						<Input
							id="tpl-subject"
							disabled={!editable}
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="tpl-body">Body (markdown)</Label>
						<Textarea
							id="tpl-body"
							rows={16}
							className="font-mono text-xs"
							disabled={!editable}
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Variables</Label>
						<div className="flex flex-wrap gap-1.5">
							{template.variables.map((v) => (
								<button
									key={v}
									type="button"
									disabled={!editable}
									title="Append to body"
									className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-muted/70"
									onClick={() => setBody((b) => `${b}{{${v}}}`)}
								>
									{`{{${v}}}`}
								</button>
							))}
						</div>
					</div>
				</div>
			</Section>
			<Section
				title="Preview"
				description="With sample data. Save before sending a test."
				actions={
					<Button
						size="sm"
						variant="outline"
						disabled={
							dirty ||
							test.isPending ||
							!can("POST", `/admin/content/email-templates/${template.id}/test`)
						}
						onClick={() => test.mutate({ params: { path } })}
					>
						{test.isPending ? <Loader2 className="animate-spin" /> : <Send />}
						Send test to me
					</Button>
				}
			>
				<div className="overflow-hidden rounded-md border">
					<div className="border-b bg-muted/40 px-4 py-2 text-sm">
						<span className="text-muted-foreground">Subject: </span>
						<span className="font-medium">{renderTemplate(subject)}</span>
					</div>
					<div className="bg-background p-4">
						<MarkdownPreview>{renderTemplate(body)}</MarkdownPreview>
					</div>
				</div>
			</Section>
		</div>
	);
}
