import { useQueryClient } from "@tanstack/react-query";
import {
	BarChart3Icon,
	KeyIcon,
	MoreHorizontal,
	PencilIcon,
	PlusIcon,
	PowerIcon,
	RefreshCwIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { getApiErrorMessage } from "@/lib/api-error";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/lib/components/alert-dialog";
import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/lib/components/dropdown-menu";
import { Input } from "@/lib/components/input";
import { EmptyState } from "@/lib/components/page-layout";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { SquircleSurface } from "@/lib/components/squircle";
import { StatusBadge } from "@/lib/components/status-badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/lib/components/tooltip";
import { toast } from "@/lib/components/use-toast";
import { useApi } from "@/lib/fetch-client";
import { extractOrgAndProjectFromPath } from "@/lib/navigation-utils";
import { cn } from "@/lib/utils";

import { Time } from "@llmgateway/shared";

import {
	formatCurrentPeriodUsageSummary,
	formatCurrencyAmount,
	formatPeriodLimitSummary,
	type ApiKeyLimitPayload,
} from "./api-key-limit-fields";
import {
	ApiKeyLimitBadge,
	ApiKeyLimitMeter,
	apiKeyLimitTextTone,
} from "./api-key-limit-indicators";
import { getApiKeyLimitStatus } from "./api-key-limit-status";
import { ApiKeyLimitsDialog } from "./api-key-limits-dialog";
import { formatApiKeyExpiry } from "./api-key-ttl-fields";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { ReactivateApiKeyDialog } from "./reactivate-api-key-dialog";
import { RenameApiKeyDialog } from "./rename-api-key-dialog";
import { RollApiKeyDialog } from "./roll-api-key-dialog";

import type { ApiKeyLimitStatus } from "./api-key-limit-status";
import type { ApiKey, Project } from "@/lib/types";
import type { Route } from "next";

interface ApiKeysListProps {
	selectedProject: Project | null;
	initialData: ApiKey[];
}

type StatusFilter = "all" | "active" | "inactive";
type CreatorFilter = "mine" | "all";
type LimitFilter = "all" | "approaching" | "reached";

const maskedTokenChipClass =
	"inline-block max-w-full truncate rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs";

function ManagedPlaygroundTableRow({
	apiKey,
	statisticsUrl,
}: {
	apiKey: ApiKey;
	statisticsUrl: Route;
}) {
	return (
		<TableRow className="group hover:bg-card transition-colors">
			<TableCell>
				<div className="flex items-center gap-2">
					<span className="font-medium">Playground</span>
					<Badge variant="outline">Managed</Badge>
				</div>
			</TableCell>
			<TableCell className="min-w-40 max-w-40">
				<span className={maskedTokenChipClass}>{apiKey.maskedToken}</span>
			</TableCell>
			<TableCell>
				<StatusBadge status={apiKey.status} variant="detailed" />
			</TableCell>
			<TableCell>
				<Time date={apiKey.createdAt} format="monthDayYear" />
			</TableCell>
			<TableCell className="text-muted-foreground">
				{apiKey.creator?.name ?? apiKey.creator?.email ?? "Unknown"}
			</TableCell>
			<TableCell>{formatCurrencyAmount(apiKey.usage)}</TableCell>
			<TableCell className="text-muted-foreground">
				{formatCurrentPeriodUsageSummary(apiKey).summary}
			</TableCell>
			<TableCell className="text-muted-foreground">—</TableCell>
			<TableCell className="text-muted-foreground">—</TableCell>
			<TableCell className="sticky right-0 bg-card text-center transition-colors group-hover:bg-[color-mix(in_srgb,var(--muted)_50%,var(--card))]">
				<Button variant="ghost" size="icon" className="h-8 w-8" asChild>
					<Link href={statisticsUrl} prefetch={true}>
						<BarChart3Icon className="h-4 w-4" />
						<span className="sr-only">View Statistics</span>
					</Link>
				</Button>
			</TableCell>
		</TableRow>
	);
}

function ManagedPlaygroundCard({
	apiKey,
	statisticsUrl,
}: {
	apiKey: ApiKey;
	statisticsUrl: Route;
}) {
	return (
		<div className="rounded-xl p-3 space-y-3 transition-colors hover:bg-card">
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="font-medium text-sm">Playground</h3>
					<Badge variant="outline">Managed</Badge>
					<StatusBadge status={apiKey.status} />
				</div>
				<Button variant="ghost" size="sm" asChild>
					<Link href={statisticsUrl} prefetch={true}>
						<BarChart3Icon className="h-4 w-4 sm:mr-2" />
						<span className="hidden sm:inline">Statistics</span>
					</Link>
				</Button>
			</div>
			<div className="pt-2 border-t grid grid-cols-2 gap-3">
				<div>
					<div className="text-xs text-muted-foreground mb-1">API Key</div>
					<div className="font-mono text-xs break-all">
						{apiKey.maskedToken}
					</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground mb-1">Usage</div>
					<div className="font-mono text-xs">
						{formatCurrencyAmount(apiKey.usage)}
					</div>
				</div>
			</div>
			<div className="pt-2 border-t">
				<div className="text-xs text-muted-foreground mb-1">Created By</div>
				<div className="text-sm">
					{apiKey.creator?.name ?? apiKey.creator?.email ?? "Unknown"}
				</div>
			</div>
		</div>
	);
}

export function ApiKeysList({
	selectedProject,
	initialData,
}: ApiKeysListProps) {
	const queryClient = useQueryClient();
	const api = useApi();
	const pathname = usePathname();
	const { selectedOrganization } = useDashboardNavigation();
	// Developers only ever see their own keys, so the All/Mine selector is hidden.
	const isDeveloper = selectedOrganization?.role === "developer";
	const { orgId, projectId } = useMemo(
		() => extractOrgAndProjectFromPath(pathname),
		[pathname],
	);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>("all");
	const [limitFilter, setLimitFilter] = useState<LimitFilter>("all");
	const [search, setSearch] = useState("");
	const [reactivateKey, setReactivateKey] = useState<ApiKey | null>(null);
	const [rollKey, setRollKey] = useState<ApiKey | null>(null);
	const [renameKey, setRenameKey] = useState<ApiKey | null>(null);
	const [limitsKey, setLimitsKey] = useState<ApiKey | null>(null);

	const getStatisticsUrl = (keyId: string) =>
		`/dashboard/${orgId}/${projectId}/api-keys/${keyId}` as Route;

	// All hooks must be called before any conditional returns
	const { data, isLoading, error } = api.useQuery(
		"get",
		"/keys/api",
		{
			params: {
				query: {
					projectId: selectedProject?.id ?? "",
					filter: creatorFilter,
				},
			},
		},
		{
			enabled: !!selectedProject?.id,
			staleTime: 5 * 60 * 1000, // 5 minutes
			refetchOnWindowFocus: false,
			refetchOnMount: false,
			refetchInterval: false,
			// Only use initialData when filter is "all" (matches the SSR data)
			...(creatorFilter === "all" && {
				initialData: {
					apiKeys: initialData.map((key) => ({
						...key,
						maskedToken: key.maskedToken,
						ownerBudget: key.ownerBudget ?? null,
					})),
					userRole: "owner" as const,
				},
			}),
		},
	);

	const { mutate: deleteMutation } = api.useMutation(
		"delete",
		"/keys/api/{id}",
	);
	const {
		mutate: toggleKeyStatus,
		mutateAsync: toggleKeyStatusAsync,
		isPending: isTogglePending,
	} = api.useMutation("patch", "/keys/api/{id}");

	const updateKeyUsageLimitMutation = api.useMutation(
		"patch",
		"/keys/api/limit/{id}",
	);

	const { mutateAsync: rollKeyAsync, isPending: isRollPending } =
		api.useMutation("post", "/keys/api/{id}/roll");

	const { mutateAsync: renameKeyAsync, isPending: isRenamePending } =
		api.useMutation("patch", "/keys/api/{id}");

	const allKeys = data?.apiKeys.filter((key) => key.status !== "deleted") ?? [];
	const activeKeys = allKeys.filter((key) => key.status === "active");
	const inactiveKeys = allKeys.filter((key) => key.status === "inactive");
	const planLimits = data?.planLimits;

	const limitStatuses = new Map<string, ApiKeyLimitStatus>(
		allKeys.map((key) => [key.id, getApiKeyLimitStatus(key)]),
	);
	const limitStatusOf = (key: ApiKey): ApiKeyLimitStatus =>
		limitStatuses.get(key.id) ?? { period: null, state: null, total: null };

	const statusFilteredKeys = (() => {
		switch (statusFilter) {
			case "active":
				return activeKeys;
			case "inactive":
				return inactiveKeys;
			case "all":
			default:
				return allKeys;
		}
	})();

	const approachingKeys = statusFilteredKeys.filter(
		(key) => limitStatusOf(key).state === "approaching",
	);
	const reachedKeys = statusFilteredKeys.filter(
		(key) => limitStatusOf(key).state === "reached",
	);

	const filteredKeys = (() => {
		const base = (() => {
			switch (limitFilter) {
				case "approaching":
					return approachingKeys;
				case "reached":
					return reachedKeys;
				case "all":
				default:
					return statusFilteredKeys;
			}
		})();
		const q = search.trim().toLowerCase();
		if (!q) {
			return base;
		}
		return base.filter(
			(key) =>
				key.description?.toLowerCase().includes(q) ||
				key.maskedToken?.toLowerCase().includes(q) ||
				key.creator?.name?.toLowerCase().includes(q) ||
				key.creator?.email?.toLowerCase().includes(q),
		);
	})();

	// Auto-switch to a tab with content if current tab becomes empty
	useEffect(() => {
		if (statusFilteredKeys.length === 0 && allKeys.length > 0) {
			if (statusFilter === "active" && inactiveKeys.length > 0) {
				setStatusFilter("inactive");
			} else if (statusFilter === "inactive" && activeKeys.length > 0) {
				setStatusFilter("active");
			} else if (statusFilter !== "all") {
				setStatusFilter("all");
			}
		}
	}, [
		statusFilteredKeys.length,
		allKeys.length,
		activeKeys.length,
		inactiveKeys.length,
		statusFilter,
	]);

	// Drop a usage filter once no key in the current status tab matches it.
	useEffect(() => {
		if (limitFilter === "approaching" && approachingKeys.length === 0) {
			setLimitFilter("all");
		} else if (limitFilter === "reached" && reachedKeys.length === 0) {
			setLimitFilter("all");
		}
	}, [limitFilter, approachingKeys.length, reachedKeys.length]);

	// Show message if no project is selected
	if (!selectedProject) {
		return (
			<EmptyState
				icon={<KeyIcon />}
				title="No project selected"
				hint="Select a project to view its API keys."
			/>
		);
	}

	if (isLoading) {
		return (
			<EmptyState
				icon={<KeyIcon />}
				title="Loading API keys"
				hint="Fetching the keys for this project."
			/>
		);
	}

	if (error) {
		return (
			<EmptyState
				icon={<KeyIcon />}
				title="Couldn't load API keys"
				hint="Please try again."
			/>
		);
	}

	const deleteKey = (id: string) => {
		deleteMutation(
			{
				params: {
					path: { id },
				},
			},
			{
				onSuccess: () => {
					const queryKey = api.queryOptions("get", "/keys/api", {
						params: {
							query: { projectId: selectedProject.id },
						},
					}).queryKey;

					void queryClient.invalidateQueries({ queryKey });

					toast({ title: "API key deleted successfully." });
				},
			},
		);
	};

	const invalidateApiKeys = () => {
		const queryKey = api.queryOptions("get", "/keys/api", {
			params: {
				query: { projectId: selectedProject.id },
			},
		}).queryKey;

		void queryClient.invalidateQueries({ queryKey });
	};

	const toggleStatus = (key: ApiKey) => {
		// Reactivating a key whose TTL has already passed requires a fresh future
		// expiration, so prompt for one instead of toggling directly.
		if (key.status !== "active") {
			const expiry = formatApiKeyExpiry(key.expiresAt);
			if (expiry?.expired) {
				setReactivateKey(key);
				return;
			}
		}

		const newStatus = key.status === "active" ? "inactive" : "active";

		toggleKeyStatus(
			{
				params: {
					path: { id: key.id },
				},
				body: {
					status: newStatus,
				},
			},
			{
				onSuccess: () => {
					invalidateApiKeys();

					toast({
						title: "API Key Status Updated",
						description: "The API key status has been updated.",
					});
				},
			},
		);
	};

	const handleReactivate = async (expiresAt: string) => {
		if (!reactivateKey) {
			return;
		}

		try {
			await toggleKeyStatusAsync({
				params: {
					path: { id: reactivateKey.id },
				},
				body: {
					status: "active",
					expiresAt,
				},
			});

			invalidateApiKeys();
			setReactivateKey(null);

			toast({
				title: "API Key Reactivated",
				description: "The API key is active again with a new expiration.",
			});
		} catch (error) {
			toast({
				title: "Failed to reactivate API key.",
				description: getApiErrorMessage(error, "Please try again."),
				variant: "destructive",
			});
		}
	};

	const handleRoll = async (): Promise<string | undefined> => {
		if (!rollKey) {
			return undefined;
		}

		try {
			const data = await rollKeyAsync({
				params: {
					path: { id: rollKey.id },
				},
			});

			invalidateApiKeys();

			toast({
				title: "API Key Rolled",
				description: "A new secret has been generated for this key.",
			});

			return data.apiKey.token;
		} catch (error) {
			toast({
				title: "Failed to roll API key.",
				description: getApiErrorMessage(error, "Please try again."),
				variant: "destructive",
			});
			return undefined;
		}
	};

	const handleRename = async (description: string) => {
		if (!renameKey) {
			return;
		}

		try {
			await renameKeyAsync({
				params: {
					path: { id: renameKey.id },
				},
				body: {
					description,
				},
			});

			invalidateApiKeys();
			setRenameKey(null);

			toast({
				title: "API Key Renamed",
				description: "The API key has been renamed.",
			});
		} catch (error) {
			toast({
				title: "Failed to rename API key.",
				description: getApiErrorMessage(error, "Please try again."),
				variant: "destructive",
			});
		}
	};

	const updateKeyUsageLimit = async (
		id: string,
		payload: ApiKeyLimitPayload,
	) => {
		try {
			await updateKeyUsageLimitMutation.mutateAsync(
				{
					params: {
						path: { id },
					},
					body: payload,
				},
				{
					onSuccess: () => {
						const queryKey = api.queryOptions("get", "/keys/api", {
							params: {
								query: { projectId: selectedProject.id },
							},
						}).queryKey;

						void queryClient.invalidateQueries({ queryKey });

						toast({
							title: "API Key Limits Updated",
							description: "The API key limits have been updated.",
						});
					},
				},
			);
		} catch (error) {
			toast({
				title: "Failed to update API key limits.",
				description: getApiErrorMessage(error, "Please try again."),
				variant: "destructive",
			});
			throw error;
		}
	};

	const renderUsage = (key: ApiKey) => {
		const total = limitStatusOf(key).total;

		return (
			<div className="space-y-1">
				<div
					className={cn(
						"font-mono text-xs",
						total && apiKeyLimitTextTone[total.state],
					)}
				>
					{formatCurrencyAmount(key.usage)}
					{total ? ` / ${formatCurrencyAmount(total.limit)}` : ""}
				</div>
				{total && <ApiKeyLimitMeter gauge={total} />}
			</div>
		);
	};

	const renderExpiry = (key: ApiKey) => {
		const expiry = formatApiKeyExpiry(key.expiresAt);
		if (!expiry) {
			return null;
		}

		return (
			<div
				className={`text-xs ${expiry.expired ? "text-destructive" : "text-muted-foreground"}`}
			>
				{expiry.expired ? "Expired" : "Expires"} {expiry.label}
			</div>
		);
	};

	if (allKeys.length === 0) {
		return (
			<EmptyState
				icon={<KeyIcon />}
				title="No API keys yet"
				hint="Create your first key to call the gateway."
				action={
					<CreateApiKeyDialog
						selectedProject={selectedProject}
						disabled={
							planLimits ? planLimits.currentCount >= planLimits.maxKeys : false
						}
						disabledMessage={
							planLimits
								? `${planLimits.plan === "enterprise" ? "Enterprise" : planLimits.plan === "pro" ? "Pro" : "Free"} plan allows maximum ${planLimits.maxKeys} API keys per workspace`
								: undefined
						}
					>
						<Button
							type="button"
							disabled={
								planLimits
									? planLimits.currentCount >= planLimits.maxKeys
									: false
							}
							className="flex items-center gap-2"
						>
							<PlusIcon className="h-4 w-4" />
							Create API Key
						</Button>
					</CreateApiKeyDialog>
				}
			/>
		);
	}

	return (
		<>
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search keys…"
					className="h-8 w-48 text-sm"
				/>
				{!isDeveloper && (
					<Select
						value={creatorFilter}
						onValueChange={(v) => setCreatorFilter(v as CreatorFilter)}
					>
						<SelectTrigger className="h-8 w-32 text-sm">
							<SelectValue placeholder="Owner" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All keys</SelectItem>
							<SelectItem value="mine">My keys</SelectItem>
						</SelectContent>
					</Select>
				)}
				<Select
					value={statusFilter}
					onValueChange={(v) => setStatusFilter(v as StatusFilter)}
				>
					<SelectTrigger className="h-8 w-32 text-sm">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All ({allKeys.length})</SelectItem>
						<SelectItem value="active">Active ({activeKeys.length})</SelectItem>
						<SelectItem value="inactive">
							Inactive ({inactiveKeys.length})
						</SelectItem>
					</SelectContent>
				</Select>
				{(approachingKeys.length > 0 || reachedKeys.length > 0) && (
					<Select
						value={limitFilter}
						onValueChange={(v) => setLimitFilter(v as LimitFilter)}
					>
						<SelectTrigger className="h-8 w-36 text-sm">
							<SelectValue placeholder="Limit state" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Any usage</SelectItem>
							<SelectItem value="approaching">Near limit</SelectItem>
							<SelectItem value="reached">Limit reached</SelectItem>
						</SelectContent>
					</Select>
				)}
				{planLimits && (
					<span className="ml-auto text-xs text-muted-foreground">
						{planLimits.currentCount} of {planLimits.maxKeys} keys used
						{planLimits.currentCount >= planLimits.maxKeys
							? " — limit reached"
							: ""}
					</span>
				)}
			</div>

			<SquircleSurface>
				{filteredKeys.length === 0 ? (
					<EmptyState
						title="No matching keys"
						hint="Adjust the search or filters."
					/>
				) : (
					<>
						{/* Desktop Table */}
						<div className="hidden md:block">
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="text-xs text-muted-foreground">
											Name
										</TableHead>
										<TableHead className="w-40 text-xs text-muted-foreground">
											API Key
										</TableHead>
										<TableHead className="text-xs text-muted-foreground">
											Status
										</TableHead>
										<TableHead className="text-xs text-muted-foreground">
											Created
										</TableHead>
										<TableHead className="text-xs text-muted-foreground">
											Created By
										</TableHead>
										<TableHead className="text-xs text-muted-foreground">
											Usage
										</TableHead>
										<TableHead className="text-xs text-muted-foreground">
											Limits
										</TableHead>
										<TableHead className="sticky right-0 w-12 bg-card" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredKeys.map((key) => {
										if (key.kind === "playground") {
											return (
												<ManagedPlaygroundTableRow
													key={key.id}
													apiKey={key}
													statisticsUrl={getStatisticsUrl(key.id)}
												/>
											);
										}

										return (
											<TableRow
												key={key.id}
												className="group hover:bg-card transition-colors"
											>
												<TableCell className="font-medium">
													<span className="text-sm font-medium">
														{key.description}
													</span>
												</TableCell>
												<TableCell className="min-w-40 max-w-40">
													<span className={maskedTokenChipClass}>
														{key.maskedToken}
													</span>
												</TableCell>
												<TableCell>
													<div className="space-y-1">
														<StatusBadge
															status={key.status}
															variant="detailed"
														/>
														<ApiKeyLimitBadge
															apiKey={key}
															status={limitStatusOf(key)}
														/>
														{renderExpiry(key)}
													</div>
												</TableCell>
												<TableCell>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/50 hover:border-muted-foreground">
																<Time
																	date={key.createdAt}
																	format="monthDayYear"
																/>
															</span>
														</TooltipTrigger>
														<TooltipContent>
															<p className="max-w-xs text-xs whitespace-nowrap">
																<Time
																	date={key.createdAt}
																	format="monthDayYearHourMinuteZone"
																/>
															</p>
														</TooltipContent>
													</Tooltip>
												</TableCell>
												<TableCell>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="text-muted-foreground cursor-help">
																{key.creator?.name ??
																	key.creator?.email ??
																	"Unknown"}
															</span>
														</TooltipTrigger>
														<TooltipContent>
															<p className="max-w-xs text-xs">
																{key.creator?.email ?? "No email available"}
															</p>
														</TooltipContent>
													</Tooltip>
												</TableCell>
												<TableCell>{renderUsage(key)}</TableCell>
												<TableCell>
													<div className="text-left text-xs text-muted-foreground">
														<div>
															{key.usageLimit
																? `${formatCurrencyAmount(key.usageLimit)} all-time`
																: "No limit"}
														</div>
														<div>{formatPeriodLimitSummary(key)}</div>
													</div>
												</TableCell>
												<TableCell className="sticky right-0 bg-card text-center transition-colors group-hover:bg-[color-mix(in_srgb,var(--muted)_50%,var(--card))]">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon"
																className="h-8 w-8"
															>
																<MoreHorizontal className="h-4 w-4" />
																<span className="sr-only">Open menu</span>
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuLabel>Actions</DropdownMenuLabel>
															<DropdownMenuItem asChild>
																<Link
																	href={getStatisticsUrl(key.id)}
																	prefetch={true}
																>
																	<BarChart3Icon className="mr-2 h-4 w-4" />
																	View Statistics
																</Link>
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																onClick={() => setRenameKey(key)}
															>
																<PencilIcon className="mr-2 h-4 w-4" />
																Rename Key
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() => toggleStatus(key)}
															>
																<PowerIcon className="mr-2 h-4 w-4" />
																{key.status === "active"
																	? "Deactivate"
																	: "Activate"}{" "}
																Key
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() => setLimitsKey(key)}
															>
																<SlidersHorizontalIcon className="mr-2 h-4 w-4" />
																Edit Limits
															</DropdownMenuItem>
															<DropdownMenuItem onClick={() => setRollKey(key)}>
																<RefreshCwIcon className="mr-2 h-4 w-4" />
																Roll Key
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<AlertDialog>
																<AlertDialogTrigger asChild>
																	<DropdownMenuItem
																		onSelect={(e) => e.preventDefault()}
																		className="text-destructive focus:text-destructive"
																	>
																		Delete
																	</DropdownMenuItem>
																</AlertDialogTrigger>
																<AlertDialogContent>
																	<AlertDialogHeader>
																		<AlertDialogTitle>
																			Are you absolutely sure?
																		</AlertDialogTitle>
																		<AlertDialogDescription>
																			This action cannot be undone. This will
																			permanently delete the API key and it will
																			no longer be able to access your account.
																		</AlertDialogDescription>
																	</AlertDialogHeader>
																	<AlertDialogFooter>
																		<AlertDialogCancel>
																			Cancel
																		</AlertDialogCancel>
																		<AlertDialogAction
																			onClick={() => deleteKey(key.id)}
																		>
																			Delete
																		</AlertDialogAction>
																	</AlertDialogFooter>
																</AlertDialogContent>
															</AlertDialog>
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>

						{/* Mobile rows */}
						<div className="space-y-1 md:hidden">
							{filteredKeys.map((key) => {
								if (key.kind === "playground") {
									return (
										<ManagedPlaygroundCard
											key={key.id}
											apiKey={key}
											statisticsUrl={getStatisticsUrl(key.id)}
										/>
									);
								}

								return (
									<div
										key={key.id}
										className="rounded-xl p-3 space-y-3 transition-colors hover:bg-card"
									>
										<div className="flex items-start justify-between">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<h3 className="font-medium text-sm">
														{key.description}
													</h3>
													<StatusBadge status={key.status} />
													<ApiKeyLimitBadge
														apiKey={key}
														status={limitStatusOf(key)}
													/>
												</div>
												{renderExpiry(key)}
												<div className="flex items-center gap-2 mt-1">
													<span className="text-xs text-muted-foreground">
														<Time
															date={key.createdAt}
															format="monthDayYearHourMinuteZone"
														/>
													</span>
												</div>
											</div>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 w-8 p-0"
													>
														<MoreHorizontal className="h-4 w-4" />
														<span className="sr-only">Open menu</span>
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuLabel>Actions</DropdownMenuLabel>
													<DropdownMenuItem asChild>
														<Link
															href={getStatisticsUrl(key.id)}
															prefetch={true}
														>
															<BarChart3Icon className="mr-2 h-4 w-4" />
															View Statistics
														</Link>
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem onClick={() => toggleStatus(key)}>
														<PowerIcon className="mr-2 h-4 w-4" />
														{key.status === "active"
															? "Deactivate"
															: "Activate"}{" "}
														Key
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => setLimitsKey(key)}>
														<SlidersHorizontalIcon className="mr-2 h-4 w-4" />
														Edit Limits
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => setRollKey(key)}>
														<RefreshCwIcon className="mr-2 h-4 w-4" />
														Roll Key
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<AlertDialog>
														<AlertDialogTrigger asChild>
															<DropdownMenuItem
																onSelect={(e) => e.preventDefault()}
																className="text-destructive focus:text-destructive"
															>
																Delete
															</DropdownMenuItem>
														</AlertDialogTrigger>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>
																	Are you absolutely sure?
																</AlertDialogTitle>
																<AlertDialogDescription>
																	This action cannot be undone. This will
																	permanently delete the API key and it will no
																	longer be able to access your account.
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>Cancel</AlertDialogCancel>
																<AlertDialogAction
																	onClick={() => deleteKey(key.id)}
																>
																	Delete
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
										<div className="pt-2 border-t">
											<div className="text-xs text-muted-foreground mb-1">
												API Key
											</div>
											<div className="w-fit max-w-full rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs break-all">
												{key.maskedToken}
											</div>
										</div>
										<div className="pt-2 border-t grid gap-3 md:grid-cols-3">
											<div className="py-1">
												<div className="text-xs text-muted-foreground mb-1">
													Usage
												</div>
												{renderUsage(key)}
											</div>
											<div className="py-1">
												<div className="text-xs text-muted-foreground mb-1">
													Limits
												</div>
												<div className="text-xs text-muted-foreground">
													{key.usageLimit
														? `${formatCurrencyAmount(key.usageLimit)} all-time`
														: "No limit"}
													{" · "}
													{formatPeriodLimitSummary(key)}
												</div>
											</div>
										</div>
										<div className="pt-2 border-t">
											<div className="text-xs text-muted-foreground mb-1">
												Created By
											</div>
											<div className="text-sm">
												{key.creator?.name ?? key.creator?.email ?? "Unknown"}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</>
				)}
			</SquircleSurface>

			<ReactivateApiKeyDialog
				apiKey={reactivateKey}
				open={reactivateKey !== null}
				onOpenChange={(open) => {
					if (!open) {
						setReactivateKey(null);
					}
				}}
				onConfirm={handleReactivate}
				isPending={isTogglePending}
			/>

			<RollApiKeyDialog
				apiKey={rollKey}
				open={rollKey !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRollKey(null);
					}
				}}
				onConfirm={handleRoll}
				isPending={isRollPending}
			/>

			{limitsKey && (
				<ApiKeyLimitsDialog
					apiKey={limitsKey}
					open
					onOpenChange={(open) => {
						if (!open) {
							setLimitsKey(null);
						}
					}}
					onSubmit={(payload) => updateKeyUsageLimit(limitsKey.id, payload)}
				/>
			)}
			<RenameApiKeyDialog
				apiKey={renameKey}
				open={renameKey !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRenameKey(null);
					}
				}}
				onConfirm={handleRename}
				isPending={isRenamePending}
			/>
		</>
	);
}
