import { createHash } from "node:crypto";

import {
	and,
	asc,
	db,
	defaultAllowedFileTypes,
	defaultSystemRulesConfig,
	eq,
	guardrailConfig,
	guardrailRule,
	guardrailViolation,
	isNull,
	or,
	type GuardrailAction,
	type SystemRulesConfig,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

export interface GuardrailConfigData {
	enabled: boolean;
	systemRules: SystemRulesConfig;
	maxFileSizeMb: number;
	allowedFileTypes: string[];
	piiAction: GuardrailAction;
}

export interface GuardrailScope {
	config: GuardrailConfigData;
	projectId: string | null;
}

export interface RuleViolation {
	ruleId: string;
	ruleName: string;
	category: string;
	action: GuardrailAction;
	matchedPattern?: string;
	matchedContent?: string;
}

export interface RedactionInfo {
	ruleId: string;
	messageIndex: number;
	kind: "pii" | "secrets" | "mask";
	matches: string[];
	pattern: string;
}

export interface GuardrailResult {
	passed: boolean;
	blocked: boolean;
	violations: RuleViolation[];
	redactions: RedactionInfo[];
	rulesChecked: number;
}

export interface MessageContent {
	type: string;
	text?: string;
	image_url?: { url: string };
}

export interface Message {
	role: string;
	content: string | MessageContent[];
}

export interface FileInfo {
	name: string;
	type: string;
	size: number;
}

export interface GuardrailInput {
	organizationId: string;
	projectId?: string;
	messages: Message[];
	files?: FileInfo[];
}

/**
 * Resolve which config and rules apply: a project row with
 * inherit_organization=false replaces the organization config and its rules.
 */
async function resolveScope(
	organizationId: string,
	projectId?: string,
): Promise<GuardrailScope> {
	if (projectId) {
		const [projectConfig] = await db
			.select()
			.from(guardrailConfig)
			.where(
				and(
					eq(guardrailConfig.organizationId, organizationId),
					eq(guardrailConfig.projectId, projectId),
				),
			)
			.limit(1);

		if (projectConfig && !projectConfig.inheritOrganization) {
			return {
				projectId,
				config: {
					enabled: projectConfig.enabled,
					systemRules: projectConfig.systemRules ?? defaultSystemRulesConfig,
					maxFileSizeMb: projectConfig.maxFileSizeMb,
					allowedFileTypes:
						projectConfig.allowedFileTypes ?? defaultAllowedFileTypes,
					piiAction: projectConfig.piiAction ?? "redact",
				},
			};
		}
	}

	const [orgConfig] = await db
		.select()
		.from(guardrailConfig)
		.where(
			and(
				eq(guardrailConfig.organizationId, organizationId),
				isNull(guardrailConfig.projectId),
			),
		)
		.limit(1);

	return {
		projectId: orgConfig ? null : null,
		config: {
			enabled: orgConfig?.enabled ?? false,
			systemRules: orgConfig?.systemRules ?? defaultSystemRulesConfig,
			maxFileSizeMb: orgConfig?.maxFileSizeMb ?? 10,
			allowedFileTypes: orgConfig?.allowedFileTypes ?? defaultAllowedFileTypes,
			piiAction: orgConfig?.piiAction ?? "redact",
		},
	};
}

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
	{ name: "openai_key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
	{ name: "aws_key_id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
	{ name: "github_token", re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/ },
	{ name: "private_key", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
	{ name: "generic_secret_assignment", re: /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[^\s"']{16,}["']?/i },
];

const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
	{ name: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
	{ name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/ },
	{ name: "credit_card", re: /\b(?:\d[ -]*?){13,19}\b/ },
];

const INJECTION_PHRASES = [
	"ignore all previous instructions",
	"ignore previous instructions",
	"disregard your instructions",
	"disregard all previous",
	"forget your instructions",
	"forget previous instructions",
	"you are now in developer mode",
	"reveal your system prompt",
	"print your system prompt",
	"what is your system prompt",
	"override your instructions",
	"new instructions:",
];

const JAILBREAK_PHRASES = [
	"do anything now",
	"dan mode",
	"jailbreak",
	"no restrictions",
	"without any restrictions",
	"bypass your filters",
	"bypass content policy",
	"pretend you have no guidelines",
	"act as an unrestricted",
	"evil mode",
];

const DOCUMENT_LEAKAGE_PHRASES = [
	"dump the internal document",
	"share internal documents",
	"leak the document",
	"exfiltrate",
];

function messageTexts(messages: Message[]): Array<{ index: number; text: string }> {
	const out: Array<{ index: number; text: string }> = [];
	messages.forEach((m, index) => {
		if (typeof m.content === "string") {
			out.push({ index, text: m.content });
		} else if (Array.isArray(m.content)) {
			const text = m.content
				.filter((p) => p.type === "text" && typeof p.text === "string")
				.map((p) => p.text as string)
				.join("\n");
			if (text) {
				out.push({ index, text });
			}
		}
	});
	return out;
}

function scanPhraseList(
	text: string,
	phrases: string[],
): string[] {
	const lower = text.toLowerCase();
	return phrases.filter((p) => lower.includes(p));
}

export async function checkGuardrails(
	input: GuardrailInput,
): Promise<GuardrailResult> {
	const violations: RuleViolation[] = [];
	const redactions: RedactionInfo[] = [];
	let rulesChecked = 0;

	const scope = await resolveScope(input.organizationId, input.projectId);
	if (!scope.config.enabled) {
		return { passed: true, blocked: false, violations, redactions, rulesChecked };
	}

	const texts = messageTexts(input.messages);
	const sys = scope.config.systemRules;

	const push = (
		violation: RuleViolation,
		messageIndex: number,
		matches: string[],
		kind?: RedactionInfo["kind"],
	) => {
		violations.push(violation);
		if (violation.action === "redact" && matches.length > 0) {
			redactions.push({
				ruleId: violation.ruleId,
				messageIndex,
				kind: kind ?? "mask",
				matches,
				pattern: violation.matchedPattern ?? "",
			});
		}
	};

	// --- system rules ---
	if (sys.prompt_injection?.enabled) {
		rulesChecked++;
		for (const { index, text } of texts) {
			const hits = scanPhraseList(text, INJECTION_PHRASES);
			if (hits.length) {
				push(
					{
						ruleId: "system:prompt_injection",
						ruleName: "Prompt injection",
						category: "prompt_injection",
						action: sys.prompt_injection.action,
						matchedPattern: hits.join(", "),
						matchedContent: text.slice(0, 500),
					},
					index,
					hits,
				);
			}
		}
	}
	if (sys.jailbreak?.enabled) {
		rulesChecked++;
		for (const { index, text } of texts) {
			const hits = scanPhraseList(text, JAILBREAK_PHRASES);
			if (hits.length) {
				push(
					{
						ruleId: "system:jailbreak",
						ruleName: "Jailbreak attempt",
						category: "jailbreak",
						action: sys.jailbreak.action,
						matchedPattern: hits.join(", "),
						matchedContent: text.slice(0, 500),
					},
					index,
					hits,
				);
			}
		}
	}
	if (sys.pii_detection?.enabled) {
		rulesChecked++;
		for (const { index, text } of texts) {
			for (const p of PII_PATTERNS) {
				const matches = Array.from(text.matchAll(new RegExp(p.re, "g"))).map(
					(m) => m[0],
				);
				if (matches.length) {
					push(
						{
							ruleId: "system:pii_detection",
							ruleName: "PII detection",
							category: "pii",
							action: scope.config.piiAction,
							matchedPattern: p.name,
							matchedContent: matches.join(", ").slice(0, 500),
						},
						index,
						matches,
						"pii",
					);
				}
			}
		}
	}
	if (sys.secrets?.enabled) {
		rulesChecked++;
		for (const { index, text } of texts) {
			for (const p of SECRET_PATTERNS) {
				const matches = Array.from(text.matchAll(new RegExp(p.re, "g"))).map(
					(m) => m[0],
				);
				if (matches.length) {
					push(
						{
							ruleId: "system:secrets",
							ruleName: "Secret/credential exposure",
							category: "secrets",
							action: sys.secrets.action,
							matchedPattern: p.name,
							matchedContent: matches.join(", ").slice(0, 500),
						},
						index,
						matches,
						"secrets",
					);
				}
			}
		}
	}
	if (sys.file_types?.enabled && input.files?.length) {
		rulesChecked++;
		for (const file of input.files) {
			const tooLarge = file.size > scope.config.maxFileSizeMb * 1024 * 1024;
			const disallowed =
				scope.config.allowedFileTypes.length > 0 &&
				!scope.config.allowedFileTypes.includes(file.type);
			if (tooLarge || disallowed) {
				push(
					{
						ruleId: "system:file_types",
						ruleName: "File type restriction",
						category: "file_types",
						action: sys.file_types.action,
						matchedPattern: file.type,
						matchedContent: `${file.name} (${file.size} bytes)`,
					},
					0,
					[],
				);
			}
		}
	}
	if (sys.document_leakage?.enabled) {
		rulesChecked++;
		for (const { index, text } of texts) {
			const hits = scanPhraseList(text, DOCUMENT_LEAKAGE_PHRASES);
			if (hits.length) {
				push(
					{
						ruleId: "system:document_leakage",
						ruleName: "Document leakage",
						category: "document_leakage",
						action: sys.document_leakage.action,
						matchedPattern: hits.join(", "),
						matchedContent: text.slice(0, 500),
					},
					index,
					hits,
				);
			}
		}
	}

	// --- custom rules ---
	const rules = await db
		.select()
		.from(guardrailRule)
		.where(
			and(
				eq(guardrailRule.organizationId, input.organizationId),
				eq(guardrailRule.enabled, true),
				scope.projectId === null
					? or(
							isNull(guardrailRule.projectId),
							input.projectId
								? eq(guardrailRule.projectId, input.projectId)
								: undefined,
						)
					: eq(guardrailRule.projectId, scope.projectId),
			),
		)
		.orderBy(asc(guardrailRule.priority));

	for (const rule of rules) {
		rulesChecked++;
		const cfg = rule.config;
		for (const { index, text } of texts) {
			let matches: string[] = [];
			if (cfg.type === "blocked_terms") {
				for (const term of cfg.terms) {
					if (cfg.matchType === "regex") {
						try {
							const flags = cfg.caseSensitive ? "g" : "gi";
							const found = Array.from(text.matchAll(new RegExp(term, flags))).map((m) => m[0]);
							matches.push(...found);
						} catch {
							// invalid user-supplied regex: skip term
						}
					} else if (cfg.matchType === "exact") {
						const flags = cfg.caseSensitive ? "g" : "gi";
						const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						matches.push(
							...Array.from(
								text.matchAll(new RegExp(`\\b${esc}\\b`, flags)),
							).map((m) => m[0]),
						);
					} else {
						// contains
						const hay = cfg.caseSensitive ? text : text.toLowerCase();
						const needle = cfg.caseSensitive ? term : term.toLowerCase();
						if (hay.includes(needle)) {
							matches.push(term);
						}
					}
				}
			} else if (cfg.type === "custom_regex") {
				try {
					matches = Array.from(text.matchAll(new RegExp(cfg.pattern, "gi"))).map(
						(m) => m[0],
					);
				} catch {
					// invalid user-supplied regex: skip rule
				}
			} else if (cfg.type === "topic_restriction") {
				const lower = text.toLowerCase();
				for (const topic of cfg.blockedTopics) {
					if (lower.includes(topic.toLowerCase())) {
						matches.push(topic);
					}
				}
				if (
					matches.length === 0 &&
					cfg.allowedTopics &&
					cfg.allowedTopics.length > 0 &&
					!cfg.allowedTopics.some((t) => lower.includes(t.toLowerCase()))
				) {
					matches.push("off-topic");
				}
			}

			if (matches.length && rule.action !== "allow") {
				push(
					{
						ruleId: rule.id,
						ruleName: rule.name,
						category: cfg.type,
						action: rule.action,
						matchedPattern: cfg.type,
						matchedContent: matches.join(", ").slice(0, 500),
					},
					index,
					matches,
				);
			}
		}
	}

	const blocked = violations.some((v) => v.action === "block");
	return {
		passed: violations.length === 0,
		blocked,
		violations,
		redactions,
		rulesChecked,
	};
}

export function applyRedactions(
	messages: Message[],
	redactions: RedactionInfo[],
): Message[] {
	const clone = messages.map((m) => ({ ...m }));
	for (const r of redactions) {
		const msg = clone[r.messageIndex];
		if (!msg) {
			continue;
		}
		const mask = (text: string) => {
			let out = text;
			for (const m of r.matches) {
				out = out.split(m).join("[REDACTED]");
			}
			return out;
		};
		if (typeof msg.content === "string") {
			msg.content = mask(msg.content);
		} else if (Array.isArray(msg.content)) {
			msg.content = msg.content.map((p) =>
				p.type === "text" && typeof p.text === "string"
					? { ...p, text: mask(p.text) }
					: p,
			);
		}
	}
	return clone;
}

export async function logViolation(
	organizationId: string,
	violation: RuleViolation,
	context?: {
		apiKeyId?: string;
		model?: string;
		logId?: string;
		retainSensitiveContent?: boolean;
	},
): Promise<void> {
	const actionTaken =
		violation.action === "block"
			? "blocked"
			: violation.action === "redact"
				? "redacted"
				: "warned";
	try {
		await db.insert(guardrailViolation).values({
			organizationId,
			logId: context?.logId,
			ruleId: violation.ruleId,
			ruleName: violation.ruleName,
			category: violation.category,
			actionTaken,
			matchedPattern: violation.matchedPattern,
			matchedContent: context?.retainSensitiveContent
				? violation.matchedContent
				: null,
			contentHash: violation.matchedContent
				? createHash("sha256").update(violation.matchedContent).digest("hex")
				: null,
			apiKeyId: context?.apiKeyId,
			model: context?.model,
		});
	} catch (error) {
		logger.error("guardrail violation write failed", {
			error: error instanceof Error ? error.message : String(error),
			organizationId,
			ruleId: violation.ruleId,
		});
	}
}
