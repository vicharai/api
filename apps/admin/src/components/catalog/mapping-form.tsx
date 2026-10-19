"use client";

import { SimpleSelect, ToggleChips } from "@/components/ui/controls";
import {
	PLAIN_DECIMAL,
	perMillionToPerToken,
	perTokenToPerMillion,
	plainDecimal,
} from "@/lib/decimal";

import { Input, Label, Switch } from "@llmgateway/shared/components";

import type {
	CatalogMapping,
	CatalogMappingInput,
	CatalogStability,
} from "@/lib/api/admin-types";

type ApiFormat = NonNullable<CatalogMappingInput["apiFormat"]>;
type ReasoningEffort = NonNullable<
	CatalogMappingInput["reasoningEfforts"]
>[number];
type ToolChoice = NonNullable<
	CatalogMappingInput["supportedToolChoices"]
>[number];

function within<T extends string>(options: readonly T[], values: string[]) {
	return options.filter((o) => values.includes(o));
}

export const API_FORMATS = [
	"provider-native",
	"openai-chat-completions",
	"openai-responses",
	"google-vertex",
] as const satisfies readonly ApiFormat[];
export const REASONING_EFFORTS = [
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const satisfies readonly ReasoningEffort[];
export const TOOL_CHOICES = [
	"auto",
	"none",
	"required",
	"function",
] as const satisfies readonly ToolChoice[];
const STABILITIES: CatalogStability[] = [
	"stable",
	"beta",
	"experimental",
	"unstable",
];

/** Per-token price fields, edited as $/1M. */
const TOKEN_PRICES = [
	["inputPrice", "Input"],
	["outputPrice", "Output"],
	["cachedInputPrice", "Cached input"],
	["cacheWriteInputPrice", "Cache write"],
	["imageInputPrice", "Image input"],
] as const;
/** Flat USD prices. */
const FLAT_PRICES = [
	["requestPrice", "Per request"],
	["webSearchPrice", "Per web search"],
] as const;
export const CAPABILITIES = [
	["streaming", "Streaming"],
	["vision", "Vision"],
	["tools", "Tools"],
	["jsonOutput", "JSON output"],
	["jsonOutputSchema", "JSON schema"],
	["reasoning", "Reasoning"],
	["webSearch", "Web search"],
	["audio", "Audio"],
] as const;

type TokenPriceKey = (typeof TOKEN_PRICES)[number][0];
type FlatPriceKey = (typeof FLAT_PRICES)[number][0];
type CapabilityKey = (typeof CAPABILITIES)[number][0];

/** Editable form state: prices as $/1M (token) or USD (flat) strings. */
export interface MappingDraft {
	providerId: string;
	externalId: string;
	region: string;
	apiFormat: string;
	prices: Record<TokenPriceKey | FlatPriceKey, string>;
	contextSize: string;
	maxOutput: string;
	caps: Record<CapabilityKey, boolean>;
	reasoningEfforts: string[];
	supportedToolChoices: string[];
	stability: CatalogStability;
}

export function emptyDraft(providerId = ""): MappingDraft {
	return {
		providerId,
		externalId: "",
		region: "",
		apiFormat: "",
		prices: {
			inputPrice: "",
			outputPrice: "",
			cachedInputPrice: "",
			cacheWriteInputPrice: "",
			imageInputPrice: "",
			requestPrice: "",
			webSearchPrice: "",
		},
		contextSize: "",
		maxOutput: "",
		caps: {
			streaming: true,
			vision: false,
			tools: false,
			jsonOutput: false,
			jsonOutputSchema: false,
			reasoning: false,
			webSearch: false,
			audio: false,
		},
		reasoningEfforts: [],
		supportedToolChoices: [],
		stability: "stable",
	};
}

export function draftFromMapping(m: CatalogMapping): MappingDraft {
	return {
		providerId: m.providerId,
		externalId: m.externalId,
		region: m.region ?? "",
		apiFormat: m.apiFormat ?? "",
		prices: {
			inputPrice: perTokenToPerMillion(m.inputPrice),
			outputPrice: perTokenToPerMillion(m.outputPrice),
			cachedInputPrice: perTokenToPerMillion(m.cachedInputPrice),
			cacheWriteInputPrice: perTokenToPerMillion(m.cacheWriteInputPrice),
			imageInputPrice: perTokenToPerMillion(m.imageInputPrice),
			requestPrice: m.requestPrice ?? "",
			webSearchPrice: m.webSearchPrice ?? "",
		},
		contextSize: m.contextSize ? String(m.contextSize) : "",
		maxOutput: m.maxOutput ? String(m.maxOutput) : "",
		caps: {
			streaming: m.streaming,
			vision: m.vision ?? false,
			tools: m.tools ?? false,
			jsonOutput: m.jsonOutput ?? false,
			jsonOutputSchema: m.jsonOutputSchema ?? false,
			reasoning: m.reasoning ?? false,
			webSearch: m.webSearch ?? false,
			audio: m.audio ?? false,
		},
		reasoningEfforts: m.reasoningEfforts ?? [],
		supportedToolChoices: m.supportedToolChoices ?? [],
		stability: m.stability ?? "stable",
	};
}

const INT = /^\d+$/;

/** Field-level problems; empty when the draft can be saved. */
export function draftErrors(d: MappingDraft): Partial<Record<string, string>> {
	const errors: Partial<Record<string, string>> = {};
	if (!d.providerId) {
		errors.providerId = "Pick a provider";
	}
	if (!d.externalId.trim()) {
		errors.externalId = "Required";
	}
	for (const [key] of [...TOKEN_PRICES, ...FLAT_PRICES]) {
		const value = d.prices[key].trim();
		const required = key === "inputPrice" || key === "outputPrice";
		if (value === "" ? required : !PLAIN_DECIMAL.test(value)) {
			errors[key] = value === "" ? "Required" : "Use a plain number";
		}
	}
	for (const key of ["contextSize", "maxOutput"] as const) {
		if (d[key] !== "" && !INT.test(d[key])) {
			errors[key] = "Whole number";
		}
	}
	return errors;
}

export function draftToInput(d: MappingDraft): CatalogMappingInput {
	const token = (key: TokenPriceKey) => perMillionToPerToken(d.prices[key]);
	return {
		externalId: d.externalId.trim(),
		region: d.region.trim() || null,
		apiFormat: API_FORMATS.find((f) => f === d.apiFormat) ?? null,
		inputPrice: token("inputPrice") ?? "0",
		outputPrice: token("outputPrice") ?? "0",
		cachedInputPrice: token("cachedInputPrice"),
		cacheWriteInputPrice: token("cacheWriteInputPrice"),
		imageInputPrice: token("imageInputPrice"),
		requestPrice: plainDecimal(d.prices.requestPrice),
		webSearchPrice: plainDecimal(d.prices.webSearchPrice),
		contextSize: d.contextSize ? Number(d.contextSize) : null,
		maxOutput: d.maxOutput ? Number(d.maxOutput) : null,
		...d.caps,
		reasoningEfforts: d.caps.reasoning
			? within(REASONING_EFFORTS, d.reasoningEfforts)
			: null,
		supportedToolChoices: d.caps.tools
			? within(TOOL_CHOICES, d.supportedToolChoices)
			: null,
		stability: d.stability,
		deactivatedAt: null,
	};
}

function FieldError({ message }: { message?: string }) {
	return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

/**
 * Mapping fields shared by the mapping drawer and the add-model wizard.
 * `providerPicker` is rendered in place of the provider field when given.
 */
export function MappingFields({
	draft,
	onChange,
	providerPicker,
	disabled,
	pricesOnly,
}: {
	draft: MappingDraft;
	onChange: (draft: MappingDraft) => void;
	providerPicker?: React.ReactNode;
	disabled?: boolean;
	/** Hides identity and capability fields (price override on a built-in). */
	pricesOnly?: boolean;
}) {
	const errors = draftErrors(draft);
	const set = (patch: Partial<MappingDraft>) =>
		onChange({ ...draft, ...patch });
	const setPrice = (key: TokenPriceKey | FlatPriceKey, value: string) =>
		set({ prices: { ...draft.prices, [key]: value } });

	return (
		<div className="space-y-5">
			{pricesOnly ? null : (
				<div className="grid gap-3 sm:grid-cols-2">
					{providerPicker ? (
						<div className="space-y-1.5">
							<Label>Provider</Label>
							{providerPicker}
							<FieldError message={errors.providerId} />
						</div>
					) : null}
					<div className="space-y-1.5">
						<Label htmlFor="map-external">Upstream model id</Label>
						<Input
							id="map-external"
							className="font-mono"
							disabled={disabled}
							placeholder="e.g. gpt-4o-mini"
							value={draft.externalId}
							onChange={(e) => set({ externalId: e.target.value })}
						/>
						<FieldError message={errors.externalId} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="map-region">Region (optional)</Label>
						<Input
							id="map-region"
							disabled={disabled}
							value={draft.region}
							onChange={(e) => set({ region: e.target.value })}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>API format</Label>
						<SimpleSelect
							className="w-full"
							ariaLabel="API format"
							value={draft.apiFormat || "default"}
							onChange={(v) => set({ apiFormat: v === "default" ? "" : v })}
							options={[
								{ value: "default", label: "Provider default" },
								...API_FORMATS.map((f) => ({ value: f, label: f })),
							]}
						/>
					</div>
				</div>
			)}

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium">Prices</legend>
				<p className="text-xs text-muted-foreground">
					Token prices in USD per 1M tokens; stored per token exactly as
					entered.
				</p>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{TOKEN_PRICES.map(([key, label]) => (
						<div key={key} className="space-y-1.5">
							<Label htmlFor={`price-${key}`}>
								{label}{" "}
								<span className="text-xs text-muted-foreground">$/1M</span>
							</Label>
							<Input
								id={`price-${key}`}
								inputMode="decimal"
								disabled={disabled}
								placeholder={
									key === "inputPrice" || key === "outputPrice" ? "0.00" : "—"
								}
								value={draft.prices[key]}
								onChange={(e) => setPrice(key, e.target.value)}
								aria-invalid={Boolean(errors[key])}
							/>
							<FieldError message={errors[key]} />
						</div>
					))}
					{FLAT_PRICES.map(([key, label]) => (
						<div key={key} className="space-y-1.5">
							<Label htmlFor={`price-${key}`}>
								{label}{" "}
								<span className="text-xs text-muted-foreground">USD</span>
							</Label>
							<Input
								id={`price-${key}`}
								inputMode="decimal"
								disabled={disabled}
								placeholder="—"
								value={draft.prices[key]}
								onChange={(e) => setPrice(key, e.target.value)}
								aria-invalid={Boolean(errors[key])}
							/>
							<FieldError message={errors[key]} />
						</div>
					))}
				</div>
			</fieldset>

			{pricesOnly ? null : (
				<>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<div className="space-y-1.5">
							<Label htmlFor="map-context">Context (tokens)</Label>
							<Input
								id="map-context"
								inputMode="numeric"
								disabled={disabled}
								value={draft.contextSize}
								onChange={(e) => set({ contextSize: e.target.value })}
							/>
							<FieldError message={errors.contextSize} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="map-maxout">Max output</Label>
							<Input
								id="map-maxout"
								inputMode="numeric"
								disabled={disabled}
								value={draft.maxOutput}
								onChange={(e) => set({ maxOutput: e.target.value })}
							/>
							<FieldError message={errors.maxOutput} />
						</div>
						<div className="space-y-1.5">
							<Label>Stability</Label>
							<SimpleSelect
								className="w-full"
								ariaLabel="Stability"
								value={draft.stability}
								onChange={(stability) => set({ stability })}
								options={STABILITIES.map((s) => ({ value: s, label: s }))}
							/>
						</div>
					</div>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium">Capabilities</legend>
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
							{CAPABILITIES.map(([key, label]) => (
								<label key={key} className="flex items-center gap-2 text-sm">
									<Switch
										disabled={disabled}
										checked={draft.caps[key]}
										onCheckedChange={(checked) =>
											set({ caps: { ...draft.caps, [key]: checked } })
										}
									/>
									{label}
								</label>
							))}
						</div>
						{draft.caps.reasoning ? (
							<div className="space-y-1.5">
								<Label>Reasoning efforts</Label>
								<ToggleChips
									options={REASONING_EFFORTS}
									value={draft.reasoningEfforts}
									onChange={(reasoningEfforts) => set({ reasoningEfforts })}
								/>
							</div>
						) : null}
						{draft.caps.tools ? (
							<div className="space-y-1.5">
								<Label>Tool choices</Label>
								<ToggleChips
									options={TOOL_CHOICES}
									value={draft.supportedToolChoices}
									onChange={(supportedToolChoices) =>
										set({ supportedToolChoices })
									}
								/>
							</div>
						) : null}
					</fieldset>
				</>
			)}
		</div>
	);
}
