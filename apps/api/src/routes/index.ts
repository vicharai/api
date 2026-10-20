import { OpenAPIHono } from "@hono/zod-openapi";

import { apiAuth as auth } from "@/auth/config.js";
import { adminActionLogMiddleware } from "@/middleware/admin.js";

import { db } from "@llmgateway/db";
import {
	accountBlockMessage,
	accountSuspensionMessage,
} from "@llmgateway/shared/account-block";

import { activity } from "./activity.js";
import { adminAccountControls } from "./admin-account-controls.js";
import { adminAnnouncements } from "./admin-announcements.js";
import { adminBenchmarks } from "./admin-benchmarks.js";
import { adminCatalog } from "./admin-catalog.js";
import { adminConfig } from "./admin-config.js";
import { adminContentFilter } from "./admin-content-filter.js";
import { adminContent } from "./admin-content.js";
import { adminCrm } from "./admin-crm.js";
import { adminLicense } from "./admin-license.js";
import { adminLimitHits } from "./admin-limit-hits.js";
import { adminLoad } from "./admin-load.js";
import { adminModelVerifications } from "./admin-model-verifications.js";
import { adminMoney } from "./admin-money.js";
import { adminNotes } from "./admin-notes.js";
import { adminOps } from "./admin-ops.js";
import { adminOrgDetails } from "./admin-org-details.js";
import { adminPlatform } from "./admin-platform.js";
import { adminProviderAccess } from "./admin-provider-access.js";
import adminProviderCredentials from "./admin-provider-credentials.js";
import { adminRequestLookup } from "./admin-request-lookup.js";
import { adminRoutingAnalytics } from "./admin-routing-analytics.js";
import { adminRoutingOverrides } from "./admin-routing-overrides.js";
import { adminSystem } from "./admin-system.js";
import { adminTeam } from "./admin-team.js";
import { adminUserManagement } from "./admin-user-management.js";
import { adminUsers } from "./admin-users.js";
import admin from "./admin.js";
import { analytics } from "./analytics.js";
import { customModels } from "./custom-models.js";
import keysApi from "./keys-api.js";
import { logs } from "./logs.js";
import { notifications } from "./notifications.js";
import organization from "./organization.js";
import { payments } from "./payments.js";
import projects from "./projects.js";
import { promoCodes } from "./promo-codes.js";
import { routingConfig } from "./routing-config.js";
import team from "./team.js";
import { user } from "./user.js";

import type { ServerTypes } from "@/vars.js";

export const routes = new OpenAPIHono<ServerTypes>();

// Middleware to verify authentication
routes.use("/*", async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });

	if (!session?.user) {
		return c.json({ message: "Unauthorized" }, 401);
	}

	const user = await db.query.user.findFirst({
		where: { id: { eq: session.user.id } },
		columns: {
			status: true,
			blockReason: true,
			suspendedUntil: true,
			suspendReason: true,
		},
	});
	if (user?.status === "deactivated") {
		return c.json({ message: accountBlockMessage(user.blockReason) }, 403);
	}
	if (user?.suspendedUntil && user.suspendedUntil.getTime() > Date.now()) {
		return c.json(
			{
				message: accountSuspensionMessage(
					user.suspendedUntil,
					user.suspendReason,
				),
				suspendedUntil: user.suspendedUntil.toISOString(),
			},
			403,
		);
	}

	c.set("user", session.user);
	c.set("session", session.session);

	return await next();
});

routes.route("/user", user);
routes.route("/notifications", notifications);

routes.route("/logs", logs);

routes.route("/activity", activity);

routes.use("/admin/*", adminActionLogMiddleware);
routes.route("/admin", adminLicense);
routes.route("/admin", admin);
routes.route("/admin", adminProviderCredentials);
routes.route("/admin", adminCatalog);
routes.route("/admin", adminOps);
routes.route("/admin", adminOrgDetails);
routes.route("/admin", adminRoutingAnalytics);
routes.route("/admin", adminContentFilter);
routes.route("/admin", adminLimitHits);
routes.route("/admin", adminBenchmarks);
routes.route("/admin", adminModelVerifications);
routes.route("/admin", adminLoad);
routes.route("/admin", adminProviderAccess);
routes.route("/admin", adminCrm);
routes.route("/admin", adminUsers);
routes.route("/admin", adminTeam);
routes.route("/admin", adminRoutingOverrides);
routes.route("/admin", adminNotes);
routes.route("/admin", adminUserManagement);
routes.route("/admin", adminAccountControls);
routes.route("/admin", adminRequestLookup);
routes.route("/admin", adminAnnouncements);
routes.route("/admin", adminPlatform);
routes.route("/admin", adminConfig);
routes.route("/admin", adminSystem);
routes.route("/admin", adminMoney);
routes.route("/admin", adminContent);

routes.route("/analytics", analytics);

routes.route("/keys", keysApi);
routes.route("/projects", projects);

routes.route("/orgs", organization);
routes.route("/orgs", promoCodes);
routes.route("/team", team);
routes.route("/payments", payments);
routes.route("/routing-config", routingConfig);
routes.route("/custom-models", customModels);
