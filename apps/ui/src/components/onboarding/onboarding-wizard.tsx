"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Loader2, ArrowRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";

import { AuthHeader, authLinkClass } from "@/components/auth/auth-shell";
import { QuickStartSection } from "@/components/shared/quick-start-snippet";
import { useDefaultProject } from "@/hooks/useDefaultProject";
import { Button } from "@/lib/components/button";
import { useApi } from "@/lib/fetch-client";

import type { ReactNode } from "react";

export function OnboardingWizard() {
	const router = useRouter();
	const posthog = usePostHog();
	const queryClient = useQueryClient();
	const api = useApi();
	const { data: project } = useDefaultProject();

	const [apiKey, setApiKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [isCompleting, setIsCompleting] = useState(false);
	const hasTrackedView = useRef(false);

	const completeOnboarding = api.useMutation(
		"post",
		"/user/me/complete-onboarding",
	);

	const existingKeys = api.useQuery(
		"get",
		"/keys/api",
		{
			params: {
				query: { projectId: project?.id ?? "" },
			},
		},
		{
			enabled: !!project?.id,
		},
	);

	const hasExistingKeys =
		(existingKeys.data?.apiKeys?.filter((k) => k.status === "active") ?? [])
			.length > 0;

	const createApiKey = api.useMutation("post", "/keys/api");

	const orgId = project?.organizationId ?? "";

	// Track view on mount
	useEffect(() => {
		if (!hasTrackedView.current) {
			posthog.capture("onboarding_viewed");
			hasTrackedView.current = true;
		}
	}, [posthog]);

	const handleCreateKey = () => {
		if (!project?.id || createApiKey.isPending) {
			return;
		}
		createApiKey.mutate(
			{
				body: {
					description: "Onboarding",
					projectId: project.id,
				},
			},
			{
				onSuccess: (data) => {
					setApiKey(data.apiKey.token);
					posthog.capture("onboarding_api_key_created");
				},
			},
		);
	};

	const handleCopyKey = () => {
		if (!apiKey) {
			return;
		}
		void navigator.clipboard.writeText(apiKey);
		setCopied(true);
		posthog.capture("onboarding_api_key_copied");
		setTimeout(() => setCopied(false), 2000);
	};

	const handleGoToDashboard = async () => {
		setIsCompleting(true);
		posthog.capture("onboarding_completed");
		try {
			await completeOnboarding.mutateAsync({});
			const queryKey = api.queryOptions("get", "/user/me").queryKey;
			await queryClient.invalidateQueries({ queryKey });
			router.push("/dashboard");
		} catch {
			setIsCompleting(false);
		}
	};

	return (
		<div className="flex flex-col">
			<AuthHeader
				title="Welcome to Vichar"
				description="Two steps to your first request. You can always come back to this from the dashboard."
			/>

			<ol className="mt-8 flex flex-col">
				<li className="flex gap-4 border-t border-divider py-6">
					<StepNumber>1</StepNumber>
					<div className="min-w-0 flex-1 space-y-4">
						<div>
							<h2 className="flex items-center gap-2 text-base font-medium text-heading">
								<KeyRound className="size-[18px] text-muted-foreground" />
								Create an API key
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								It authenticates every request you send to Vichar.
							</p>
						</div>
						<div>
							{apiKey ? (
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<code
											data-testid="onboarding-api-key"
											className="flex-1 rounded-lg bg-muted p-3 font-mono text-sm break-all text-heading"
										>
											{apiKey}
										</code>
										<Button
											variant="outline"
											size="sm"
											onClick={handleCopyKey}
											className="shrink-0"
										>
											{copied ? (
												<Check className="h-4 w-4" />
											) : (
												<Copy className="h-4 w-4" />
											)}
										</Button>
									</div>
									<p className="text-xs text-muted-foreground">
										This key is only shown once. Store it somewhere safe.
									</p>
								</div>
							) : existingKeys.isLoading ? (
								<div className="h-10 w-full animate-pulse rounded-full bg-muted" />
							) : hasExistingKeys ? (
								<p className="text-sm text-muted-foreground">
									You already have API keys.{" "}
									<Link
										href={`/dashboard/${orgId}/${project?.id}/api-keys`}
										className={authLinkClass}
									>
										Manage them in the dashboard
									</Link>
									.
								</p>
							) : (
								<Button
									data-testid="onboarding-create-key"
									onClick={handleCreateKey}
									disabled={createApiKey.isPending || !project?.id}
									className="w-full sm:w-auto"
								>
									{createApiKey.isPending ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Creating key...
										</>
									) : (
										"Create API key"
									)}
								</Button>
							)}
							{createApiKey.isError && (
								<p className="mt-2 text-sm text-destructive">
									Could not create an API key. You can create one from the
									dashboard.
								</p>
							)}
						</div>
					</div>
				</li>

				<li className="flex gap-4 border-y border-divider py-6">
					<StepNumber>2</StepNumber>
					<div className="min-w-0 flex-1 space-y-4">
						<div>
							<h2 className="text-base font-medium text-heading">
								Make your first request
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								OpenAI-compatible. Point your SDK at Vichar and keep your code.
							</p>
						</div>
						<QuickStartSection apiKey={apiKey ?? undefined} />
					</div>
				</li>
			</ol>

			<Button
				data-testid="onboarding-finish"
				onClick={handleGoToDashboard}
				disabled={isCompleting}
				className="mt-8 self-end"
			>
				{isCompleting ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Setting up...
					</>
				) : (
					<>
						Go to Dashboard
						<ArrowRight className="ml-2 h-4 w-4" />
					</>
				)}
			</Button>
		</div>
	);
}

function StepNumber({ children }: { children: ReactNode }) {
	return (
		<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-google-blue-soft text-sm font-medium text-google-blue tabular-nums">
			{children}
		</span>
	);
}
