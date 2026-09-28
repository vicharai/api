import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";

import { adminAuthMiddleware } from "@/middleware/admin.js";

import {
	db,
	desc,
	eq,
	invalidateOrganizationsCache,
	sql,
	tables,
} from "@llmgateway/db";
import { getDevPlanCreditsLimit } from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

/**
 * Manually-assigned dev plans (Vichar Stage 1: no Stripe subscriptions).
 *
 * Kept on a dedicated router guarded by adminAuthMiddleware — session plus the
 * ADMIN_EMAILS allowlist — because every /admin router in upstream is also
 * gated on the white-label enterprise license, which a self-hosted Vichar
 * deployment does not have. Mounted at /admin like the other admin routers;
 * hono scopes each router's middleware to its own routes.
 */
export const adminDevPlan = new OpenAPIHono<ServerTypes>();

adminDevPlan.use("/*", adminAuthMiddleware);

/**
 * Clears an organization's manually-assigned dev plan: tier back to "none",
 * allowance counters zeroed, PAYG overflow off. Stripe fields are left alone —
 * orgs with a live Stripe-managed subscription are rejected before this runs.
 */
async function removeDevPlan(org: { id: string }): Promise<void> {
	await db
		.update(tables.organization)
		.set({
			devPlan: "none",
			devPlanCreditsLimit: "0",
			devPlanCreditsUsed: "0",
			devPlanBillingCycleStart: null,
			devPlanPaygEnabled: false,
			devPlanPremiumCreditsUsed: "0",
			devPlanPremiumWeekStart: null,
			devPlanPendingTier: null,
			devPlanCancelled: false,
			devPlanExpiresAt: null,
		})
		.where(eq(tables.organization.id, org.id));
}

const devPlanBody = z.object({
	tier: z.enum(["lite", "pro", "max", "none"]),
	// Monthly allowance in USD. Defaults to the tier's catalog allowance
	// (getDevPlanCreditsLimit).
	monthlyAllowanceUsd: z.number().positive().optional(),
	// Reset devPlanCreditsUsed and start a fresh billing cycle. Defaults to
	// true; pass false to keep accrued usage.
	resetUsage: z.boolean().optional(),
});

const devPlanResult = z.object({
	message: z.string(),
	devPlan: z.string(),
	devPlanCreditsLimit: z.string(),
	devPlanCreditsUsed: z.string(),
	devPlanPaygEnabled: z.boolean(),
});

// Manually assign a dev-plan tier to an organization without Stripe. Used for
// internally-managed subscriptions: sets the tier and allowance directly and
// always leaves PAYG overflow off, so the allowance stays a hard cap. Orgs
// with a live Stripe-managed DevPass subscription are rejected — cancel that
// first or the plan state diverges from Stripe's.
const assignDevPlanRoute = createRoute({
	method: "post",
	path: "/organizations/{orgId}/dev-plan",
	request: {
		params: z.object({
			orgId: z.string(),
		}),
		body: {
			content: {
				"application/json": {
					schema: devPlanBody,
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: devPlanResult,
				},
			},
			description: "Dev plan assigned (or removed when tier is 'none').",
		},
	},
});

const removeDevPlanRoute = createRoute({
	method: "delete",
	path: "/organizations/{orgId}/dev-plan",
	request: {
		params: z.object({
			orgId: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: devPlanResult,
				},
			},
			description: "Dev plan removed",
		},
	},
});

adminDevPlan.openapi(assignDevPlanRoute, async (c) => {
	const user = c.get("user");
	const { orgId } = c.req.valid("param");
	const { tier, monthlyAllowanceUsd, resetUsage } = c.req.valid("json");

	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});

	if (!org || org.status === "deleted") {
		throw new HTTPException(404, { message: "Organization not found" });
	}

	if (org.devPlanStripeSubscriptionId) {
		throw new HTTPException(400, {
			message:
				"This organization has a Stripe-managed DevPass subscription. Cancel it before assigning a plan manually.",
		});
	}

	if (tier === "none") {
		await removeDevPlan(org);
	} else {
		const creditsLimit = monthlyAllowanceUsd ?? getDevPlanCreditsLimit(tier);
		if (!Number.isFinite(creditsLimit) || creditsLimit <= 0) {
			throw new HTTPException(400, {
				message: "monthlyAllowanceUsd must be a positive number",
			});
		}

		const keepUsage = resetUsage === false;
		await db
			.update(tables.organization)
			.set({
				devPlan: tier,
				devPlanCreditsLimit: String(creditsLimit),
				...(keepUsage
					? {}
					: {
							devPlanCreditsUsed: "0",
							devPlanPremiumCreditsUsed: "0",
							devPlanPremiumWeekStart: null,
							devPlanIncludedResetPassesUsed: 0,
						}),
				devPlanBillingCycleStart: new Date(),
				// Manual assignments are a hard allowance cap: no PAYG overflow,
				// no pending downgrade, not cancelled, no expiry.
				devPlanPaygEnabled: false,
				devPlanPendingTier: null,
				devPlanCancelled: false,
				devPlanExpiresAt: null,
			})
			.where(eq(tables.organization.id, orgId));
	}

	await invalidateOrganizationsCache([orgId]);

	const updated = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});

	await logAuditEvent({
		organizationId: orgId,
		userId: user!.id,
		action: "dev_plan.admin_assign",
		resourceType: "organization",
		resourceId: orgId,
		metadata: {
			tier,
			monthlyAllowanceUsd,
			resetUsage,
		},
	});

	return c.json({
		message:
			tier === "none"
				? "Dev plan removed"
				: `Dev plan ${tier} assigned with $${String(updated!.devPlanCreditsLimit)} monthly allowance`,
		devPlan: updated!.devPlan,
		devPlanCreditsLimit: String(updated!.devPlanCreditsLimit ?? "0"),
		devPlanCreditsUsed: String(updated!.devPlanCreditsUsed ?? "0"),
		devPlanPaygEnabled: updated!.devPlanPaygEnabled,
	});
});

adminDevPlan.openapi(removeDevPlanRoute, async (c) => {
	const user = c.get("user");
	const { orgId } = c.req.valid("param");

	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});

	if (!org || org.status === "deleted") {
		throw new HTTPException(404, { message: "Organization not found" });
	}

	if (org.devPlanStripeSubscriptionId) {
		throw new HTTPException(400, {
			message:
				"This organization has a Stripe-managed DevPass subscription. Cancel it before removing the plan manually.",
		});
	}

	await removeDevPlan(org);
	await invalidateOrganizationsCache([orgId]);

	await logAuditEvent({
		organizationId: orgId,
		userId: user!.id,
		action: "dev_plan.admin_assign",
		resourceType: "organization",
		resourceId: orgId,
		metadata: { tier: "none" },
	});

	return c.json({
		message: "Dev plan removed",
		devPlan: "none",
		devPlanCreditsLimit: "0",
		devPlanCreditsUsed: "0",
		devPlanPaygEnabled: false,
	});
});

const reservationRow = z.object({
	id: z.string(),
	organizationId: z.string(),
	state: z.string(),
	reservedAmount: z.string(),
	settledAmount: z.string().nullable(),
	createdAt: z.string(),
	settledAt: z.string().nullable(),
	lastError: z.string().nullable(),
});

// Operational surface for allowance holds: open holds block allowance, and
// orphaned ones are deliberately never auto-released — this endpoint is how an
// operator reconciles them against the request log and provider invoice.
const listReservationsRoute = createRoute({
	method: "get",
	path: "/organizations/{orgId}/allowance-reservations",
	request: {
		params: z.object({
			orgId: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						reservedCredits: z.string(),
						reservations: z.array(reservationRow),
					}),
				},
			},
			description: "Allowance reservations for the organization",
		},
	},
});

adminDevPlan.openapi(listReservationsRoute, async (c) => {
	const { orgId } = c.req.valid("param");

	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
	if (!org || org.status === "deleted") {
		throw new HTTPException(404, { message: "Organization not found" });
	}

	const rows = await db
		.select({
			id: tables.allowanceReservation.id,
			organizationId: tables.allowanceReservation.organizationId,
			state: tables.allowanceReservation.state,
			reservedAmount: tables.allowanceReservation.reservedAmount,
			settledAmount: tables.allowanceReservation.settledAmount,
			createdAt: tables.allowanceReservation.createdAt,
			settledAt: tables.allowanceReservation.settledAt,
			lastError: tables.allowanceReservation.lastError,
		})
		.from(tables.allowanceReservation)
		.where(eq(tables.allowanceReservation.organizationId, orgId))
		.orderBy(desc(tables.allowanceReservation.createdAt))
		.limit(200);

	return c.json({
		reservedCredits: String(org.reservedCredits ?? "0"),
		reservations: rows.map((row) => ({
			...row,
			settledAmount:
				row.settledAmount === null ? null : String(row.settledAmount),
			createdAt: row.createdAt.toISOString(),
			settledAt: row.settledAt ? row.settledAt.toISOString() : null,
		})),
	});
});

const reservationSummaryRoute = createRoute({
	method: "get",
	path: "/allowance-reservations/summary",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						byState: z.array(
							z.object({
								state: z.string(),
								count: z.number(),
								heldUsd: z.string(),
								oldestCreatedAt: z.string().nullable(),
							}),
						),
					}),
				},
			},
			description: "Global allowance reservation health",
		},
	},
});

adminDevPlan.openapi(reservationSummaryRoute, async (c) => {
	const rows = await db
		.select({
			state: tables.allowanceReservation.state,
			count: sql<number>`count(*)::int`,
			heldUsd: sql<string>`coalesce(sum(${tables.allowanceReservation.reservedAmount}), '0')`,
			oldestCreatedAt: sql<Date | null>`min(${tables.allowanceReservation.createdAt})`,
		})
		.from(tables.allowanceReservation)
		.groupBy(tables.allowanceReservation.state);

	return c.json({
		byState: rows.map((row) => ({
			...row,
			oldestCreatedAt: row.oldestCreatedAt
				? new Date(row.oldestCreatedAt).toISOString()
				: null,
		})),
	});
});
