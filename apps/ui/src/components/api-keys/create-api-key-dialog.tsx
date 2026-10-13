import { useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";

import { useMyMemberBudget } from "@/hooks/useTeam";
import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/lib/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/lib/components/dialog";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/lib/components/tooltip";
import { toast } from "@/lib/components/use-toast";
import { useApi } from "@/lib/fetch-client";

import {
	ApiKeyLimitFields,
	buildApiKeyLimitPayload,
	createApiKeyLimitFormValue,
	validateApiKeyLimitPayloadWithinMemberBudget,
} from "./api-key-limit-fields";
import {
	ApiKeyTtlFields,
	buildApiKeyTtlExpiresAt,
	createApiKeyTtlFormValue,
} from "./api-key-ttl-fields";

import type { Project } from "@/lib/types";
import type React from "react";

interface CreateApiKeyDialogProps {
	children: React.ReactNode;
	selectedProject: Project;
	disabled?: boolean;
	disabledMessage?: string;
}

export function CreateApiKeyDialog({
	children,
	selectedProject,
	disabled = false,
	disabledMessage,
}: CreateApiKeyDialogProps) {
	const queryClient = useQueryClient();
	const posthog = usePostHog();
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<"form" | "created">("form");
	const [name, setName] = useState("");
	const [limitValue, setLimitValue] = useState(() =>
		createApiKeyLimitFormValue(),
	);
	const [ttlValue, setTtlValue] = useState(() => createApiKeyTtlFormValue());
	const [apiKey, setApiKey] = useState("");
	const api = useApi();

	const curlSnippet = `curl https://api.vichar.io/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Hello!"}]}'`;

	const { data: memberBudgetData } = useMyMemberBudget(
		selectedProject.organizationId,
	);
	const memberBudget = memberBudgetData?.budget ?? null;
	const teamBudget = memberBudgetData?.teamBudget ?? null;

	const createApiKeyMutation = api.useMutation("post", "/keys/api");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (createApiKeyMutation.isPending) {
			return;
		}

		if (!name.trim()) {
			toast({ title: "Please enter an API key name.", variant: "destructive" });
			return;
		}

		const { error, payload } = buildApiKeyLimitPayload(limitValue);
		if (error) {
			toast({ title: error, variant: "destructive" });
			return;
		}

		const budgetError = [teamBudget, memberBudget]
			.map((budget) =>
				validateApiKeyLimitPayloadWithinMemberBudget(payload, budget),
			)
			.find((error): error is string => error !== null);
		if (budgetError) {
			toast({ title: budgetError, variant: "destructive" });
			return;
		}

		const { error: ttlError, expiresAt } = buildApiKeyTtlExpiresAt(ttlValue);
		if (ttlError) {
			toast({ title: ttlError, variant: "destructive" });
			return;
		}

		try {
			const data = await createApiKeyMutation.mutateAsync({
				body: {
					description: name.trim(),
					projectId: selectedProject.id,
					expiresAt,
					...payload,
				},
			});

			const createdKey = data.apiKey;

			posthog.capture("api_key_created", {
				description: createdKey.description,
				keyId: createdKey.id,
			});

			setApiKey(createdKey.token);
			setStep("created");
		} catch (error) {
			toast({
				title: "Failed to create API key.",
				description: getApiErrorMessage(error, "Please try again."),
				variant: "destructive",
			});
		}
	};

	const copyToClipboard = () => {
		void navigator.clipboard.writeText(apiKey);
		toast({
			title: "API Key Copied",
			description: "The API key has been copied to your clipboard.",
		});
	};

	const handleClose = () => {
		setOpen(false);
		setTimeout(() => {
			const queryKey = api.queryOptions("get", "/keys/api", {
				params: { query: { projectId: selectedProject.id } },
			}).queryKey;

			void queryClient.invalidateQueries({ queryKey });

			setStep("form");
			setName("");
			setApiKey("");
			setLimitValue(createApiKeyLimitFormValue());
			setTtlValue(createApiKeyTtlFormValue());
		}, 300);
	};

	const triggerElement = disabled ? (
		<Tooltip>
			<TooltipTrigger asChild>
				<div>{children}</div>
			</TooltipTrigger>
			<TooltipContent>
				<p>{disabledMessage ?? "API key limit reached"}</p>
			</TooltipContent>
		</Tooltip>
	) : (
		children
	);

	return (
		<Dialog
			open={open}
			onOpenChange={
				disabled
					? undefined
					: (nextOpen) => {
							if (createApiKeyMutation.isPending) {
								return;
							}

							if (!nextOpen) {
								handleClose();
								return;
							}

							setOpen(true);
						}
			}
		>
			{!disabled && <DialogTrigger asChild>{triggerElement}</DialogTrigger>}
			{disabled && triggerElement}
			<DialogContent className="sm:max-w-[500px]">
				{step === "form" ? (
					<>
						<DialogHeader>
							<DialogTitle>Create API key</DialogTitle>
							<DialogDescription>
								Create a new API key for {selectedProject.name}.
							</DialogDescription>
						</DialogHeader>
						<form onSubmit={handleSubmit} className="space-y-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="name">API Key Name</Label>
								<Input
									id="name"
									placeholder="e.g. Production API Key"
									value={name}
									onChange={(e) => setName(e.target.value)}
									disabled={createApiKeyMutation.isPending}
									required
								/>
							</div>
							<ApiKeyTtlFields
								idPrefix="create-api-key"
								value={ttlValue}
								onChange={setTtlValue}
							/>
							<ApiKeyLimitFields
								idPrefix="create-api-key"
								value={limitValue}
								onChange={setLimitValue}
								memberBudget={memberBudget}
								memberBudgetLabel="Your personal or workspace default policy"
								additionalBudgets={
									teamBudget
										? [
												{
													budget: teamBudget,
													label: `${memberBudgetData?.team?.name ?? "Your team"} policy`,
												},
											]
										: []
								}
							/>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									disabled={createApiKeyMutation.isPending}
									onClick={handleClose}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={createApiKeyMutation.isPending}>
									{createApiKeyMutation.isPending
										? "Creating..."
										: "Create API Key"}
								</Button>
							</DialogFooter>
						</form>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>API key created</DialogTitle>
							<DialogDescription>
								Copy it now. You won't be able to see it again.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-2">
							<div className="space-y-1.5">
								<Label htmlFor="api-key">API key</Label>
								<div className="flex items-center gap-2">
									<Input
										id="api-key"
										value={apiKey}
										readOnly
										className="bg-muted/50 font-mono text-xs"
									/>
									<Button
										variant="outline"
										size="icon"
										onClick={copyToClipboard}
										aria-label="Copy API key"
									>
										<Copy className="h-4 w-4" />
									</Button>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label>Try it</Label>
								<div className="relative rounded-lg border border-border bg-muted/40">
									<button
										type="button"
										aria-label="Copy snippet"
										onClick={() => {
											void navigator.clipboard.writeText(curlSnippet);
											toast({ title: "Copied to clipboard" });
										}}
										className="absolute right-2 top-2 rounded-md bg-muted/80 p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									>
										<Copy className="size-3.5" />
									</button>
									<pre className="whitespace-pre-wrap break-all p-3 pr-10 font-mono text-[11.5px] leading-relaxed">
										{curlSnippet}
									</pre>
								</div>
							</div>
							<DialogFooter>
								<Button onClick={handleClose}>Done</Button>
							</DialogFooter>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
