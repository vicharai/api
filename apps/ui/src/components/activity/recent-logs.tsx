"use client";

import { format } from "date-fns";
import {
	Check,
	ChevronsUpDown,
	RefreshCw,
	Search,
	SlidersHorizontal,
	Sparkles,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { TopUpCreditsDialog } from "@/components/credits/top-up-credits-dialog";
import {
	type DateRange,
	DateRangeSelect,
} from "@/components/date-range-select";
import { Button } from "@/lib/components/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/lib/components/command";
import { Input } from "@/lib/components/input";
import { EmptyState } from "@/lib/components/page-layout";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/lib/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { SquircleSurface } from "@/lib/components/squircle";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import { LOG_ERROR_TYPE_LABELS, LOG_ERROR_TYPES } from "@llmgateway/shared";
import { formatNumber } from "@llmgateway/shared/number-format";
import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import type { paths } from "@/lib/api/v1";
import type { Route } from "next";

const UnifiedFinishReason = {
	COMPLETED: "completed",
	LENGTH_LIMIT: "length_limit",
	CONTENT_FILTER: "content_filter",
	TOOL_CALLS: "tool_calls",
	GATEWAY_ERROR: "gateway_error",
	UPSTREAM_ERROR: "upstream_error",
	CANCELED: "canceled",
	UNKNOWN: "unknown",
} as const;

type ApiLog =
	paths["/logs"]["get"]["responses"][200]["content"]["application/json"]["logs"][number];

interface ProviderOption {
	id: string;
	label: string;
}

interface ModelOption {
	id: string;
	label: string;
	aliases: string[];
	providerIds: string[];
}

interface RecentLogsProps {
	initialData?:
		| paths["/logs"]["get"]["responses"][200]["content"]["application/json"]
		| undefined;
	providerOptions: ProviderOption[];
	modelOptions: ModelOption[];
	projectId: string | null;
	orgId?: string | null;
}

const TOPUP_PROMPT_DISMISSED_KEY = "first-log-topup-dismissed";

function getCookie(name: string): string | undefined {
	if (typeof document === "undefined") {
		return undefined;
	}
	const match = document.cookie.match(
		new RegExp(
			`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
		),
	);
	return match ? decodeURIComponent(match[1]!) : undefined;
}

function setCookie(name: string, value: string, days = 365) {
	const ms = days * 86_400_000;
	const expires = new Date(Date.now() + ms).toUTCString();
	document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function LogStatus({ log }: { log: ApiLog }) {
	const failed = Boolean(log.hasError);
	const filtered = log.unifiedFinishReason === "content_filter";
	const canceled = Boolean(log.canceled);
	const tone = failed
		? "bg-destructive"
		: filtered
			? "bg-warning"
			: canceled
				? "bg-muted-foreground/50"
				: "bg-success";
	const textTone = failed
		? "text-destructive"
		: filtered
			? "text-warning"
			: "text-muted-foreground";
	return (
		<span className="inline-flex items-center gap-1.5 text-xs">
			<span className={cn("size-1.5 rounded-full", tone)} />
			<span className={cn("capitalize", textTone)}>
				{(log.unifiedFinishReason ?? (failed ? "error" : "ok")).replace(
					/_/g,
					" ",
				)}
			</span>
		</span>
	);
}

function FirstLogTopUpPrompt() {
	const { selectedOrganization } = useDashboardState();
	const [dismissed, setDismissed] = useState(true);

	useEffect(() => {
		const stored = getCookie(TOPUP_PROMPT_DISMISSED_KEY);
		if (stored !== "true") {
			setDismissed(false);
		}
	}, []);

	if (dismissed || !isOrganizationAdmin(selectedOrganization?.role)) {
		return null;
	}

	return (
		<div className="mt-4 relative overflow-hidden rounded-xl border border-brand/30 bg-brand-soft p-4">
			<button
				type="button"
				aria-label="Dismiss top-up prompt"
				onClick={() => {
					setDismissed(true);
					setCookie(TOPUP_PROMPT_DISMISSED_KEY, "true");
				}}
				className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<X className="h-4 w-4" />
			</button>
			<div className="flex items-start gap-3 pr-6">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-card text-brand">
					<Sparkles className="h-4 w-4" />
				</div>
				<div className="flex-1">
					<p className="text-sm font-semibold">Your first API call worked!</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Top up credits to unlock paid models with higher quality, faster
						speeds, and larger context windows.
					</p>
					<div className="mt-3">
						<TopUpCreditsDialog>
							<Button size="sm">
								<Sparkles className="mr-2 h-3.5 w-3.5" />
								Top Up Credits
							</Button>
						</TopUpCreditsDialog>
					</div>
				</div>
			</div>
		</div>
	);
}

export function RecentLogs({
	initialData,
	providerOptions,
	modelOptions,
	projectId,
	orgId,
}: RecentLogsProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const [rowSearch, setRowSearch] = useState("");
	const [dateRangeResetKey, setDateRangeResetKey] = useState(0);

	// Initialize state from URL parameters
	const [dateRange, setDateRange] = useState<DateRange | undefined>();
	const [unifiedFinishReason, setUnifiedFinishReason] = useState<
		string | undefined
	>(searchParams.get("unifiedFinishReason") ?? undefined);
	const [provider, setProvider] = useState<string | undefined>(
		searchParams.get("provider") ?? undefined,
	);
	const [model, setModel] = useState<string | undefined>(
		searchParams.get("model") ?? undefined,
	);
	const [customHeaderKey, setCustomHeaderKey] = useState<string>(
		searchParams.get("customHeaderKey") ?? "",
	);
	const [customHeaderValue, setCustomHeaderValue] = useState<string>(
		searchParams.get("customHeaderValue") ?? "",
	);
	const [sessionId, setSessionId] = useState<string>(
		searchParams.get("sessionId") ?? "",
	);
	const [apiKeyId, setApiKeyId] = useState<string | undefined>(
		searchParams.get("apiKeyId") ?? undefined,
	);
	const [usedMode, setUsedMode] = useState<string | undefined>(
		searchParams.get("usedMode") ?? undefined,
	);
	const [errorType, setErrorType] = useState<string | undefined>(
		searchParams.get("errorType") ?? undefined,
	);

	const api = useApi();
	const deferredModelSearch = useDeferredValue(modelSearch);
	const deferredRowSearch = useDeferredValue(rowSearch);

	const { data: apiKeysData } = api.useQuery(
		"get",
		"/keys/api",
		{ params: { query: { projectId: projectId ?? "" } } },
		{
			enabled: !!projectId,
			staleTime: 5 * 60 * 1000,
			refetchOnWindowFocus: false,
		},
	);

	const apiKeyOptions = useMemo(
		() =>
			(apiKeysData?.apiKeys ?? [])
				.filter((key) => key.status !== "deleted")
				.map((key) => ({
					id: key.id,
					label: key.description || key.maskedToken,
				})),
		[apiKeysData],
	);

	const scrollPositionRef = useRef<number>(0);
	const isFilteringRef = useRef<boolean>(false);

	// Function to update URL with new filter parameters
	const updateUrlWithFilters = useCallback(
		(newParams: Record<string, string | undefined>) => {
			const params = new URLSearchParams(searchParams.toString());

			// Update or remove parameters
			Object.entries(newParams).forEach(([key, value]) => {
				if (value && value !== "all") {
					params.set(key, value);
				} else {
					params.delete(key);
				}
			});

			// Update URL without triggering a page reload
			router.push(`?${params.toString()}`, { scroll: false });
		},
		[router, searchParams],
	);

	// Track scroll position
	useLayoutEffect(() => {
		const handleScroll = () => {
			if (!isFilteringRef.current) {
				scrollPositionRef.current = window.scrollY;
			}
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// Restore scroll position after filter changes
	useLayoutEffect(() => {
		if (isFilteringRef.current) {
			window.scrollTo(0, scrollPositionRef.current);
			isFilteringRef.current = false;
		}
	});

	// Updated filter change handler that updates URL
	const handleFilterChange = useCallback(
		(filterKey: string, setter: (value: string | undefined) => void) => {
			return (value: string) => {
				// Mark that we're filtering and save current position
				isFilteringRef.current = true;
				scrollPositionRef.current = window.scrollY;

				const filterValue = value === "all" ? undefined : value;

				// Update state
				setter(filterValue);

				// Update URL
				updateUrlWithFilters({ [filterKey]: filterValue });
			};
		},
		[updateUrlWithFilters],
	);

	// Build query parameters - only include defined values
	const queryParams: Record<string, string> = {
		orderBy: "createdAt_desc",
	};

	if (dateRange?.start) {
		queryParams.startDate = dateRange.start.toISOString();
	}
	if (dateRange?.end) {
		queryParams.endDate = dateRange.end.toISOString();
	}
	if (unifiedFinishReason && unifiedFinishReason !== "all") {
		queryParams.unifiedFinishReason = unifiedFinishReason;
	}
	if (provider && provider !== "all") {
		queryParams.provider = provider;
	}
	if (model && model !== "all") {
		queryParams.model = model;
	}
	if (customHeaderKey.trim()) {
		queryParams.customHeaderKey = customHeaderKey.trim();
	}
	if (customHeaderValue.trim()) {
		queryParams.customHeaderValue = customHeaderValue.trim();
	}
	if (sessionId.trim()) {
		queryParams.sessionId = sessionId.trim();
	}
	if (apiKeyId && apiKeyId !== "all") {
		queryParams.apiKeyId = apiKeyId;
	}
	if (usedMode && usedMode !== "all") {
		queryParams.usedMode = usedMode;
	}
	if (errorType && errorType !== "all") {
		queryParams.errorType = errorType;
	}
	if (projectId) {
		queryParams.projectId = projectId;
	}

	const shouldUseInitialData =
		!dateRange &&
		unifiedFinishReason ===
			(searchParams.get("unifiedFinishReason") ?? undefined) &&
		provider === (searchParams.get("provider") ?? undefined) &&
		model === (searchParams.get("model") ?? undefined) &&
		customHeaderKey === (searchParams.get("customHeaderKey") ?? "") &&
		customHeaderValue === (searchParams.get("customHeaderValue") ?? "") &&
		sessionId === (searchParams.get("sessionId") ?? "") &&
		apiKeyId === (searchParams.get("apiKeyId") ?? undefined) &&
		usedMode === (searchParams.get("usedMode") ?? undefined) &&
		errorType === (searchParams.get("errorType") ?? undefined);

	const {
		data,
		isLoading,
		isRefetching,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = api.useInfiniteQuery(
		"get",
		"/logs",
		{
			params: {
				query: queryParams,
			},
		},
		{
			enabled: !!projectId,
			initialData:
				shouldUseInitialData && initialData
					? {
							pages: [initialData],
							pageParams: [undefined],
						}
					: undefined,
			initialPageParam: undefined,
			refetchOnWindowFocus: false,
			staleTime: 5 * 60 * 1000, // 5 minutes to prevent unnecessary refetches
			getNextPageParam: (lastPage) => {
				return lastPage?.pagination?.hasMore
					? lastPage.pagination.nextCursor
					: undefined;
			},
		},
	);

	// Flatten all pages into a single array of logs, hiding retried requests
	const allLogs = (
		data?.pages.flatMap((page) => page?.logs ?? []) ?? []
	).filter((log) => !log.retriedByLogId);

	const successfulLogs = allLogs.filter(
		(log) => !log.hasError && !log.canceled,
	);

	const visibleLogs = useMemo(() => {
		const q = deferredRowSearch.trim().toLowerCase();
		if (!q) {
			return allLogs;
		}
		return allLogs.filter((log) =>
			[
				log.usedModel,
				log.usedProvider,
				log.content ?? "",
				log.unifiedFinishReason ?? "",
				log.apiKeyName ?? "",
			].some((f) => f.toLowerCase().includes(q)),
		);
	}, [allLogs, deferredRowSearch]);

	const extraFilterCount = [
		provider,
		apiKeyId,
		usedMode,
		errorType,
		customHeaderKey.trim() || undefined,
		customHeaderValue.trim() || undefined,
		sessionId.trim() || undefined,
	].filter(Boolean).length;
	const showTopUpPrompt =
		allLogs.length <= 5 &&
		successfulLogs.length > 0 &&
		successfulLogs.every((log) => log.cost === 0);

	const selectedModelOption = useMemo(
		() => modelOptions.find((option) => option.id === model),
		[model, modelOptions],
	);

	const filteredModelOptions = useMemo(() => {
		const normalizedSearch = deferredModelSearch
			.trim()
			.toLowerCase()
			.replace(/[\s/_-]/g, "");

		return modelOptions.filter((option) => {
			if (provider && !option.providerIds.includes(provider)) {
				return false;
			}

			if (!normalizedSearch) {
				return true;
			}

			const searchFields = [option.id, option.label, ...option.aliases];
			return searchFields.some((field) =>
				field
					.toLowerCase()
					.replace(/[\s/_-]/g, "")
					.includes(normalizedSearch),
			);
		});
	}, [deferredModelSearch, modelOptions, provider]);

	const handleDateRangeChange = (_value: string, range: DateRange) => {
		setDateRange(range);
		// Update URL with date range
		updateUrlWithFilters({
			startDate: range.start?.toISOString(),
			endDate: range.end?.toISOString(),
		});
	};

	const handleProviderChange = useCallback(
		(value: string) => {
			isFilteringRef.current = true;
			scrollPositionRef.current = window.scrollY;

			const nextProvider = value === "all" ? undefined : value;
			const shouldClearModel =
				model !== undefined &&
				nextProvider !== undefined &&
				!modelOptions.some(
					(option) =>
						option.id === model && option.providerIds.includes(nextProvider),
				);

			setProvider(nextProvider);
			if (shouldClearModel) {
				setModel(undefined);
			}

			updateUrlWithFilters({
				provider: nextProvider,
				model: shouldClearModel ? undefined : model,
			});
		},
		[model, modelOptions, updateUrlWithFilters],
	);

	const activeFilterCount = [
		dateRange,
		unifiedFinishReason,
		provider,
		model,
		apiKeyId,
		usedMode,
		errorType,
		customHeaderKey.trim() || undefined,
		customHeaderValue.trim() || undefined,
		sessionId.trim() || undefined,
	].filter(Boolean).length;

	const clearAllFilters = useCallback(() => {
		isFilteringRef.current = true;
		scrollPositionRef.current = window.scrollY;
		setDateRange(undefined);
		setDateRangeResetKey((key) => key + 1);
		setUnifiedFinishReason(undefined);
		setProvider(undefined);
		setModel(undefined);
		setApiKeyId(undefined);
		setUsedMode(undefined);
		setErrorType(undefined);
		setCustomHeaderKey("");
		setCustomHeaderValue("");
		setSessionId("");
		updateUrlWithFilters({
			startDate: undefined,
			endDate: undefined,
			unifiedFinishReason: undefined,
			provider: undefined,
			model: undefined,
			apiKeyId: undefined,
			usedMode: undefined,
			errorType: undefined,
			customHeaderKey: undefined,
			customHeaderValue: undefined,
			sessionId: undefined,
		});
	}, [updateUrlWithFilters]);

	if (!projectId) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				<p>Please select a project to view recent logs.</p>
			</div>
		);
	}

	return (
		<div
			className="space-y-4 max-w-full overflow-hidden"
			style={{ scrollBehavior: "auto" }}
		>
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={rowSearch}
						onChange={(e) => setRowSearch(e.target.value)}
						placeholder="Search requests…"
						className="h-8 w-52 pl-8 text-sm"
					/>
				</div>
				<DateRangeSelect
					key={dateRangeResetKey}
					onChange={handleDateRangeChange}
				/>
				<Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							role="combobox"
							aria-expanded={modelPickerOpen}
							className={cn(
								"h-8 justify-between font-normal",
								!model && "text-muted-foreground",
							)}
						>
							<span className="max-w-40 truncate">
								{selectedModelOption?.label ?? model ?? "All models"}
							</span>
							<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[320px] p-0" align="start">
						<Command shouldFilter={false}>
							<CommandInput
								placeholder="Search models…"
								value={modelSearch}
								onValueChange={setModelSearch}
							/>
							<CommandList>
								<CommandEmpty>No models found.</CommandEmpty>
								<CommandItem
									value="all"
									onSelect={() => {
										handleFilterChange("model", setModel)("all");
										setModelPickerOpen(false);
										setModelSearch("");
									}}
								>
									<Check
										className={cn(
											"h-4 w-4",
											!model ? "opacity-100" : "opacity-0",
										)}
									/>
									All models
								</CommandItem>
								{filteredModelOptions.map((option) => (
									<CommandItem
										key={option.id}
										value={`${option.id} ${option.label} ${option.aliases.join(" ")}`}
										onSelect={() => {
											handleFilterChange("model", setModel)(option.id);
											setModelPickerOpen(false);
											setModelSearch("");
										}}
									>
										<Check
											className={cn(
												"h-4 w-4",
												model === option.id ? "opacity-100" : "opacity-0",
											)}
										/>
										<div className="flex min-w-0 flex-col">
											<span className="truncate">{option.label}</span>
											{option.label !== option.id ? (
												<span className="truncate text-xs text-muted-foreground">
													{option.id}
												</span>
											) : null}
										</div>
									</CommandItem>
								))}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
				<Select
					onValueChange={handleFilterChange(
						"unifiedFinishReason",
						setUnifiedFinishReason,
					)}
					value={unifiedFinishReason ?? "all"}
				>
					<SelectTrigger className="h-8 w-32 text-sm">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						{Object.entries(UnifiedFinishReason).map(([key, value]) => (
							<SelectItem key={value} value={value}>
								{key
									.toLowerCase()
									.replace(/_/g, " ")
									.replace(/\b\w/g, (l) => l.toUpperCase())}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-8 font-normal",
								extraFilterCount === 0 && "text-muted-foreground",
							)}
						>
							<SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
							More filters
							{extraFilterCount > 0 && ` (${extraFilterCount})`}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-80 space-y-2" align="start">
						<Select
							onValueChange={handleProviderChange}
							value={provider ?? "all"}
						>
							<SelectTrigger className="h-8 w-full text-sm">
								<SelectValue placeholder="Provider" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All providers</SelectItem>
								{providerOptions.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							onValueChange={handleFilterChange("apiKeyId", setApiKeyId)}
							value={apiKeyId ?? "all"}
						>
							<SelectTrigger className="h-8 w-full text-sm">
								<SelectValue placeholder="API key" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All API keys</SelectItem>
								{apiKeyOptions.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							onValueChange={handleFilterChange("usedMode", setUsedMode)}
							value={usedMode ?? "all"}
						>
							<SelectTrigger className="h-8 w-full text-sm">
								<SelectValue placeholder="Billing mode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All billing</SelectItem>
								<SelectItem value="credits">Credits</SelectItem>
							</SelectContent>
						</Select>
						<Select
							onValueChange={handleFilterChange("errorType", setErrorType)}
							value={errorType ?? "all"}
						>
							<SelectTrigger className="h-8 w-full text-sm">
								<SelectValue placeholder="Error type" />
							</SelectTrigger>
							<SelectContent>
								{LOG_ERROR_TYPES.map((value) => (
									<SelectItem key={value} value={value}>
										{LOG_ERROR_TYPE_LABELS[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Input
							placeholder="Header key (e.g. uid)"
							value={customHeaderKey}
							onChange={(e) => {
								isFilteringRef.current = true;
								scrollPositionRef.current = window.scrollY;
								setCustomHeaderKey(e.target.value);
								updateUrlWithFilters({
									customHeaderKey: e.target.value ?? undefined,
								});
							}}
							className="h-8 text-sm"
						/>
						<Input
							placeholder="Header value (e.g. 12345)"
							value={customHeaderValue}
							onChange={(e) => {
								isFilteringRef.current = true;
								scrollPositionRef.current = window.scrollY;
								setCustomHeaderValue(e.target.value);
								updateUrlWithFilters({
									customHeaderValue: e.target.value ?? undefined,
								});
							}}
							className="h-8 text-sm"
						/>
						<Input
							placeholder="Session ID"
							value={sessionId}
							onChange={(e) => {
								isFilteringRef.current = true;
								scrollPositionRef.current = window.scrollY;
								setSessionId(e.target.value);
								updateUrlWithFilters({
									sessionId: e.target.value ?? undefined,
								});
							}}
							className="h-8 text-sm"
						/>
					</PopoverContent>
				</Popover>
				<div className="ml-auto flex items-center gap-1.5">
					{activeFilterCount > 0 && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={clearAllFilters}
							className="h-8 gap-1.5 text-muted-foreground"
						>
							<X className="h-3.5 w-3.5" />
							Reset
						</Button>
					)}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => void refetch()}
						disabled={isLoading || isRefetching || isFetchingNextPage}
						className="h-8 gap-1.5"
					>
						<RefreshCw
							className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")}
						/>
						Refresh
					</Button>
				</div>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{[64, 92, 78, 55].map((opacity, i) => (
						<div
							key={i}
							className="h-12 animate-pulse rounded-lg border border-border bg-muted/40"
							style={{ opacity: opacity / 100 }}
						/>
					))}
				</div>
			) : error ? (
				<div className="py-8 text-center text-sm text-destructive">
					Error loading logs
				</div>
			) : visibleLogs.length === 0 ? (
				<EmptyState
					title="No requests match"
					hint="Adjust the search or filters, or widen the time range."
				/>
			) : (
				<>
					<SquircleSurface>
						{/* Desktop table */}
						<Table className="hidden md:table">
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="text-xs">Time</TableHead>
									<TableHead className="text-xs">Model</TableHead>
									<TableHead className="text-right text-xs">Tokens</TableHead>
									<TableHead className="text-right text-xs">Latency</TableHead>
									<TableHead className="text-right text-xs">Cost</TableHead>
									<TableHead className="w-20 text-xs">Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{visibleLogs.map((log) => (
									<TableRow
										key={log.id}
										className="cursor-pointer"
										onClick={() =>
											router.push(
												`/dashboard/${orgId}/${projectId}/activity/${log.id}` as Route,
											)
										}
									>
										<TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
											{format(new Date(log.createdAt), "MMM d, HH:mm")}
										</TableCell>
										<TableCell className="max-w-56">
											<span className="block truncate font-mono text-[12.5px]">
												{log.usedModel}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{log.usedProvider}
											</span>
										</TableCell>
										<TableCell className="text-right text-xs tabular-nums text-muted-foreground">
											{formatNumber(Number(log.promptTokens ?? 0))} →{" "}
											{formatNumber(Number(log.completionTokens ?? 0))}
										</TableCell>
										<TableCell className="text-right text-xs tabular-nums">
											{log.duration >= 1000
												? `${(log.duration / 1000).toFixed(1)}s`
												: `${log.duration}ms`}
										</TableCell>
										<TableCell className="text-right text-xs tabular-nums">
											{log.cost !== null
												? `$${Number(log.cost).toFixed(4)}`
												: "—"}
										</TableCell>
										<TableCell>
											<LogStatus log={log} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

						{/* Mobile rows */}
						<ul className="divide-y divide-border md:hidden">
							{visibleLogs.map((log) => (
								<li key={log.id}>
									<Link
										href={
											`/dashboard/${orgId}/${projectId}/activity/${log.id}` as Route
										}
										className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
									>
										<LogStatus log={log} />
										<span className="min-w-0 flex-1">
											<span className="block truncate font-mono text-[12.5px]">
												{log.usedModel}
											</span>
											<span className="block text-xs text-muted-foreground">
												{format(new Date(log.createdAt), "MMM d, HH:mm")} ·{" "}
												{log.duration >= 1000
													? `${(log.duration / 1000).toFixed(1)}s`
													: `${log.duration}ms`}
											</span>
										</span>
										<span className="text-xs tabular-nums text-muted-foreground">
											{log.cost !== null
												? `$${Number(log.cost).toFixed(4)}`
												: "—"}
										</span>
									</Link>
								</li>
							))}
						</ul>
					</SquircleSurface>

					{visibleLogs[0] && showTopUpPrompt && <FirstLogTopUpPrompt />}

					{hasNextPage && (
						<div className="flex justify-center pt-2">
							<Button
								onClick={() => fetchNextPage()}
								disabled={isFetchingNextPage}
								variant="outline"
								size="sm"
							>
								{isFetchingNextPage ? "Loading…" : "Load more"}
							</Button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
