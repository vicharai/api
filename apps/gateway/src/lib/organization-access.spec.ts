import { HTTPException } from "hono/http-exception";
import { describe, expect, test } from "vitest";

import {
	assertOrganizationUsable,
	getOrganizationBlockReason,
	ORGANIZATION_DISABLED_MESSAGE,
	ORGANIZATION_HIGH_RISK_MESSAGE,
	ORGANIZATION_KIND_UNAVAILABLE_MESSAGE,
} from "./organization-access.js";

describe("getOrganizationBlockReason", () => {
	test("allows an active organization", () => {
		expect(
			getOrganizationBlockReason({
				status: "active",
				riskFlagged: false,
				kind: "default",
			}),
		).toBe(null);
	});

	test("blocks a deleted organization with 410", () => {
		expect(
			getOrganizationBlockReason({
				status: "deleted",
				riskFlagged: false,
				kind: "default",
			}),
		).toEqual({ status: 410, message: ORGANIZATION_DISABLED_MESSAGE });
	});

	test("includes a stored reason in the gateway error", () => {
		expect(
			getOrganizationBlockReason({
				status: "deleted",
				riskFlagged: false,
				kind: "default",
				blockReason: "Key sharing violates our terms.",
			}),
		).toEqual({
			status: 410,
			message:
				"Your account has been blocked. Reason: Key sharing violates our terms.",
		});
	});

	test("does not apply a stale reason to an active organization", () => {
		expect(
			getOrganizationBlockReason({
				status: "active",
				riskFlagged: false,
				kind: "default",
				blockReason: "Previous block",
			}),
		).toBeNull();
	});

	test("blocks a high-risk organization with 403", () => {
		expect(
			getOrganizationBlockReason({
				status: "active",
				riskFlagged: true,
				kind: "default",
			}),
		).toEqual({ status: 403, message: ORGANIZATION_HIGH_RISK_MESSAGE });
	});

	test("blocks a devpass organization with 403", () => {
		expect(
			getOrganizationBlockReason({
				status: "active",
				riskFlagged: false,
				kind: "devpass",
			}),
		).toEqual({ status: 403, message: ORGANIZATION_KIND_UNAVAILABLE_MESSAGE });
	});

	test("blocks a chat organization with 403", () => {
		expect(
			getOrganizationBlockReason({
				status: "active",
				riskFlagged: false,
				kind: "chat",
			}),
		).toEqual({ status: 403, message: ORGANIZATION_KIND_UNAVAILABLE_MESSAGE });
	});

	test("reports the deletion first when both apply", () => {
		expect(
			getOrganizationBlockReason({
				status: "deleted",
				riskFlagged: true,
				kind: "devpass",
			})?.status,
		).toBe(410);
	});
});

describe("assertOrganizationUsable", () => {
	test("throws the matching HTTP exception", () => {
		expect(() =>
			assertOrganizationUsable({
				status: "active",
				riskFlagged: false,
				kind: "default",
			}),
		).not.toThrow();

		try {
			assertOrganizationUsable({
				status: "active",
				riskFlagged: true,
				kind: "default",
			});
			expect.unreachable("expected a rejection");
		} catch (error) {
			expect(error).toBeInstanceOf(HTTPException);
			expect((error as HTTPException).status).toBe(403);
		}
	});
});
