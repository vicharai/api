import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { checkRateLimit } from "@/auth/config.js";
import { getClientIpFromContext } from "@/lib/client-ip.js";

import { db, tables } from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

/** Public, unauthenticated contact form used by the marketing site. */
export const publicContact = new OpenAPIHono<ServerTypes>();

export const PUBLIC_CONTACT_RATE_LIMIT = {
	keyPrefix: "public_contact",
	windowSizeMs: 60 * 60 * 1000,
	maxRequests: 5,
};

/** Humans take longer than this to fill in the form. */
export const MIN_FILL_TIME_MS = 3000;

export const CONTACT_TOPICS = [
	"support",
	"billing",
	"sales",
	"partnerships",
	"other",
] as const;

export const COMPANY_SIZES = [
	"1-10",
	"11-50",
	"51-200",
	"200+",
	"n/a",
] as const;

const TOPIC_LABELS: Record<(typeof CONTACT_TOPICS)[number], string> = {
	support: "Support",
	billing: "Billing",
	sales: "Sales",
	partnerships: "Partnerships",
	other: "Other",
};

const submitContact = createRoute({
	operationId: "submit_public_contact",
	method: "post",
	path: "/",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						name: z.string().trim().min(1).max(100),
						email: z.string().trim().email().max(254),
						company: z.string().trim().max(140).optional(),
						topic: z.enum(CONTACT_TOPICS).default("other"),
						size: z.enum(COMPANY_SIZES).default("n/a"),
						message: z.string().trim().min(1).max(5000),
						honeypot: z.string().max(500).optional(),
						clientTimestampMs: z.number().int().nonnegative().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ success: z.boolean() }).openapi({}),
				},
			},
			description: "Message received.",
		},
		429: { description: "Too many messages from this address." },
	},
});

publicContact.openapi(submitContact, async (c) => {
	const body = c.req.valid("json");
	const ipAddress = getClientIpFromContext(c);

	const limit = await checkRateLimit(
		ipAddress ?? "unknown",
		PUBLIC_CONTACT_RATE_LIMIT,
	);
	if (!limit.allowed) {
		throw new HTTPException(429, {
			message: "Too many messages. Please try again later.",
		});
	}

	const elapsed =
		body.clientTimestampMs === undefined
			? null
			: Date.now() - body.clientTimestampMs;
	const rejectionReason = body.honeypot
		? "honeypot"
		: elapsed !== null && elapsed < MIN_FILL_TIME_MS
			? "submitted_too_fast"
			: null;

	const header = [
		`Topic: ${TOPIC_LABELS[body.topic]}`,
		body.company ? `Company: ${body.company}` : null,
	].filter((line): line is string => line !== null);

	await db.insert(tables.enterpriseContactSubmission).values({
		name: body.name,
		email: body.email,
		country: "unknown",
		size: body.size,
		message: `${header.join("\n")}\n\n${body.message}`,
		honeypot: body.honeypot || null,
		clientTimestampMs:
			body.clientTimestampMs === undefined
				? null
				: String(body.clientTimestampMs),
		ipAddress,
		userAgent: c.req.header("user-agent") ?? null,
		spamFilterStatus: rejectionReason ? "rejected" : "pending",
		rejectionReason,
	});

	// Spam is rejected silently so bots get no signal.
	return c.json({ success: true }, 200);
});
