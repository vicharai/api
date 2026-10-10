"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
	Copy,
	Check,
	Loader2,
	ArrowRight,
	LayoutDashboard,
	KeyRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";

import { QuickStartSection } from "@/components/shared/quick-start-snippet";
import { useDefaultProject } from "@/hooks/useDefaultProject";
import { Button } from "@/lib/components/button";
import { SquircleSurface } from "@/lib/components/squircle";
import { useApi } from "@/lib/fetch-client";

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
		<div className="container mx-auto max-w-3xl px-4 py-10">
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-2 text-center">
					<h1 className="font-display text-3xl font-semibold tracking-tight">
						Create your API key
					</h1>
					<p className="text-muted-foreground">
						Your account is ready. Create an API key to start making requests.
					</p>
				</div>

				{/* API Key Card */}
				<SquircleSurface className="border border-border p-6 shadow-sm">
					<div className="mb-4">
						<p className="flex items-center gap-2 text-sm font-medium">
							<KeyRound className="h-5 w-5" />
							Your API Key
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Use this key to authenticate requests to Vichar
						</p>
					</div>
					<div>
						{apiKey ? (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<code
										data-testid="onboarding-api-key"
										className="flex-1 rounded-md border bg-muted/50 p-3 text-sm font-mono break-all"
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
							<div className="h-10 w-full animate-pulse rounded-md bg-muted" />
						) : hasExistingKeys ? (
							<p className="text-sm text-muted-foreground">
								You already have API keys.{" "}
								<Link
									href={`/dashboard/${orgId}/${project?.id}/api-keys`}
									className="font-medium text-foreground underline underline-offset-4"
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
								className="w-full"
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
				</SquircleSurface>

				{/* Quick Start Snippets */}
				<QuickStartSection apiKey={apiKey ?? undefined} />

				{/* What's Next Card */}
				<SquircleSurface className="border border-border p-6 shadow-sm">
					<div className="mb-4">
						<p className="text-sm font-medium">What&apos;s next?</p>
					</div>
					<div className="space-y-2">
						<Button asChild variant="outline" className="w-full justify-start">
							<Link href="/dashboard">
								<LayoutDashboard className="mr-2 h-4 w-4" />
								Dashboard
								<ArrowRight className="ml-auto h-4 w-4" />
							</Link>
						</Button>
					</div>
				</SquircleSurface>

				{/* Go to Dashboard */}
				<Button
					data-testid="onboarding-finish"
					size="lg"
					onClick={handleGoToDashboard}
					disabled={isCompleting}
					className="w-full"
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
		</div>
	);
}
