"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { Button } from "@/lib/components/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/lib/components/form";
import { Input } from "@/lib/components/input";
import { RadioGroup, RadioGroupItem } from "@/lib/components/radio-group";
import { Separator } from "@/lib/components/separator";
import { Switch } from "@/lib/components/switch";
import { useToast } from "@/lib/components/use-toast";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import type { CachingSettingsData } from "@/types/settings";

const cachingFormSchema = z.object({
	cachingEnabled: z.boolean(),
	cacheDurationSeconds: z
		.number()
		.min(10, "Cache duration must be at least 10 seconds")
		.max(
			31536000,
			"Cache duration must not exceed 31,536,000 seconds (1 year)",
		),
	providerCacheControlMode: z.enum(["auto", "passthrough", "off"]),
});

type CachingFormData = z.infer<typeof cachingFormSchema>;

const PROVIDER_CACHE_CONTROL_OPTIONS = [
	{
		value: "auto",
		label: "Automatic",
		description:
			"Forward the cache markers your client sends and add markers on long prompts that have none. Best when your requests do not manage caching themselves.",
	},
	{
		value: "passthrough",
		label: "Client-managed",
		description:
			"Forward your client's markers untouched and never add any. A request writes to the provider cache only when it asked to — pick this when one key serves both a coding agent that sets its own markers and traffic that should not pay the write premium.",
	},
	{
		value: "off",
		label: "Disabled",
		description:
			"Strip every marker, including ones your client sends. No cache writes and no cache reads for this project.",
	},
] as const;

interface CachingSettingsProps {
	initialData: CachingSettingsData;
	orgId: string;
	projectId: string;
	projectName: string;
}

export function CachingSettings({
	initialData,
	orgId,
	projectId,
}: CachingSettingsProps) {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const { selectedOrganization } = useDashboardNavigation();
	const zeroDataRetentionEnabled =
		selectedOrganization?.providerCompliancePolicy?.enabled === true &&
		selectedOrganization.providerCompliancePolicy.zeroDataRetention === true;

	const form = useForm<CachingFormData>({
		resolver: zodResolver(cachingFormSchema),
		defaultValues: {
			cachingEnabled:
				initialData.preferences.preferences.cachingEnabled ?? false,
			cacheDurationSeconds:
				initialData.preferences.preferences.cacheDurationSeconds ?? 60,
			providerCacheControlMode:
				initialData.preferences.preferences.providerCacheControlMode ?? "auto",
		},
	});

	const cachingEnabled = form.watch("cachingEnabled");

	const api = useApi();

	const updateProject = api.useMutation("patch", "/projects/{id}", {
		onSuccess: () => {
			const queryKey = api.queryOptions("get", "/orgs/{id}/projects", {
				params: { path: { id: orgId } },
			}).queryKey;
			void queryClient.invalidateQueries({ queryKey });
		},
	});

	const onSubmit = async (data: CachingFormData) => {
		try {
			await updateProject.mutateAsync({
				params: { path: { id: projectId } },
				body: {
					cachingEnabled: data.cachingEnabled,
					cacheDurationSeconds: data.cacheDurationSeconds,
					...(zeroDataRetentionEnabled
						? {}
						: { providerCacheControlMode: data.providerCacheControlMode }),
				},
			});

			toast({
				title: "Settings saved",
				description: "Your caching settings have been updated.",
			});
		} catch {
			toast({
				title: "Error",
				description: "Failed to save caching settings.",
				variant: "destructive",
			});
		}
	};

	return (
		<div className="space-y-4">
			{zeroDataRetentionEnabled ? (
				<div
					role="status"
					className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
				>
					<div className="font-medium">ZDR blocks caching</div>
					<p className="mt-1 text-muted-foreground">
						Response caching and provider prompt caching cannot be enabled while
						zero data retention is active.{` `}
						<a
							href="mailto:contact@vichar.io"
							className="font-medium text-brand underline underline-offset-4"
						>
							Contact us
						</a>
						{` `}to disable ZDR first.
					</p>
				</div>
			) : null}

			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
					<FormField
						control={form.control}
						name="cachingEnabled"
						render={({ field }) => (
							<FormItem className="flex flex-row items-start space-x-3 space-y-0">
								<FormControl>
									<Switch
										checked={field.value}
										onCheckedChange={field.onChange}
										disabled={zeroDataRetentionEnabled && !field.value}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel>Enable request caching</FormLabel>
								</div>
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="cacheDurationSeconds"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Cache Duration (seconds)</FormLabel>
								<FormControl>
									<Input
										type="number"
										min={10}
										max={31536000}
										className="w-32"
										disabled={!cachingEnabled}
										{...field}
										onChange={(e) => field.onChange(Number(e.target.value))}
									/>
								</FormControl>
								<FormDescription>
									Min: 10, Max: 31,536,000 (one year)
									<br />
									Note: changing this setting may take up to 5 minutes to take
									effect.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<Separator />

					<div>
						<h4 className="text-sm font-medium">Provider Cache Writes</h4>
						<p className="mt-0.5 text-muted-foreground text-sm">
							Applies to providers that support explicit prompt-cache markers
						</p>
					</div>

					<FormField
						control={form.control}
						name="providerCacheControlMode"
						render={({ field }) => (
							<FormItem className="space-y-3">
								<FormControl>
									<RadioGroup
										value={zeroDataRetentionEnabled ? "off" : field.value}
										onValueChange={field.onChange}
										className="space-y-2"
										disabled={zeroDataRetentionEnabled}
									>
										{PROVIDER_CACHE_CONTROL_OPTIONS.map((option) => {
											const selected =
												(zeroDataRetentionEnabled ? "off" : field.value) ===
												option.value;
											return (
												<label
													key={option.value}
													htmlFor={`provider-cache-${option.value}`}
													className={cn(
														"flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
														zeroDataRetentionEnabled
															? "cursor-not-allowed border-border opacity-60"
															: "cursor-pointer",
														selected
															? "border-brand/40 bg-brand-soft"
															: !zeroDataRetentionEnabled &&
																	"border-border hover:bg-accent/50",
													)}
												>
													<RadioGroupItem
														value={option.value}
														id={`provider-cache-${option.value}`}
														className="mt-0.5"
														disabled={zeroDataRetentionEnabled}
													/>
													<span className="min-w-0 flex-1 space-y-1">
														<span className="block text-sm font-medium">
															{option.label}
														</span>
														<span className="block text-muted-foreground text-sm">
															{option.description}
														</span>
													</span>
												</label>
											);
										})}
									</RadioGroup>
								</FormControl>
								<FormDescription>
									Cache writes are billed at 1.25× (5m) or 2× (1h) the input
									price; reads are 0.1×. Note: changing this setting may take up
									to 5 minutes to take effect.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<div className="flex justify-end">
						<Button
							type="submit"
							disabled={
								form.formState.isSubmitting ||
								updateProject.isPending ||
								(zeroDataRetentionEnabled && cachingEnabled)
							}
						>
							{form.formState.isSubmitting || updateProject.isPending
								? "Saving..."
								: "Save Settings"}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
}
