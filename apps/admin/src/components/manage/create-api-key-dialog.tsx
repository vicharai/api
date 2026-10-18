"use client";

import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { SimpleSelect } from "@/components/ui/controls";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
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
} from "@llmgateway/shared/components";

/** Creates an API key for an org's project and shows the token exactly once. */
export function CreateApiKeyDialog({ orgId }: { orgId: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [open, setOpen] = useState(false);
	const [projectId, setProjectId] = useState("");
	const [description, setDescription] = useState("");
	const [usageLimit, setUsageLimit] = useState("");
	const [token, setToken] = useState<string | null>(null);

	const projects = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/projects",
		{ params: { path: { orgId } } },
		{ enabled: open },
	);
	const create = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/api-keys",
		{
			onSuccess: (res) => {
				setToken(res.apiKey.token);
				toast.success("API key created");
				void invalidate("/admin/organizations/{orgId}/api-keys");
			},
		},
	);

	const activeProjects = (projects.data?.projects ?? []).filter(
		(p) => p.status !== "deleted",
	);
	const selectedProject = projectId || activeProjects[0]?.id || "";
	const limitValue = usageLimit.trim();
	const limitValid = !limitValue || Number(limitValue) > 0;

	function reset(next: boolean) {
		setOpen(next);
		if (!next) {
			setToken(null);
			setDescription("");
			setUsageLimit("");
			setProjectId("");
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!create.isPending) {
					reset(next);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					size="sm"
					variant="outline"
					disabled={!can("POST", `/admin/organizations/${orgId}/api-keys`)}
				>
					<KeyRound /> New API key
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{token ? "Copy the key now" : "Create API key"}
					</DialogTitle>
					<DialogDescription>
						{token
							? "This is the only time the full key is shown. Send it to the customer over a secure channel."
							: "Creates a gateway key on the customer's behalf. The creation is audit-logged."}
					</DialogDescription>
				</DialogHeader>
				{token ? (
					<div className="space-y-3">
						<div className="flex items-center gap-2 rounded-md border bg-muted p-2">
							<code className="min-w-0 flex-1 break-all text-xs">{token}</code>
							<CopyIdButton value={token} label="API key" />
						</div>
						<Alert>
							<AlertTriangle className="size-4" />
							<AlertTitle>Shown once</AlertTitle>
							<AlertDescription>
								Closing this dialog discards the key. Revoke it from the key
								list if it leaks.
							</AlertDescription>
						</Alert>
					</div>
				) : (
					<div className="space-y-3">
						<div className="space-y-1.5">
							<Label>Project</Label>
							{activeProjects.length > 0 ? (
								<SimpleSelect
									className="w-full"
									value={selectedProject}
									onChange={setProjectId}
									options={activeProjects.map((p) => ({
										value: p.id,
										label: p.name,
									}))}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									{projects.isLoading
										? "Loading projects…"
										: "No projects; the API picks the default."}
								</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="api-key-description">Description</Label>
							<Input
								id="api-key-description"
								value={description}
								placeholder="e.g. Created by support for onboarding"
								onChange={(e) => setDescription(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="api-key-limit">Usage limit USD (optional)</Label>
							<Input
								id="api-key-limit"
								type="number"
								min={0}
								step="0.01"
								value={usageLimit}
								onChange={(e) => setUsageLimit(e.target.value)}
							/>
						</div>
					</div>
				)}
				<DialogFooter>
					{token ? (
						<Button onClick={() => reset(false)}>Done</Button>
					) : (
						<>
							<Button variant="outline" onClick={() => reset(false)}>
								Cancel
							</Button>
							<Button
								disabled={
									!description.trim() || !limitValid || create.isPending
								}
								onClick={() =>
									create.mutate({
										params: { path: { orgId } },
										body: {
											projectId: selectedProject || undefined,
											description: description.trim(),
											usageLimit: limitValue || undefined,
										},
									})
								}
							>
								{create.isPending ? <Loader2 className="animate-spin" /> : null}
								Create key
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
