import { OpenAPIHono } from "@hono/zod-openapi";

import { apiAuth as auth } from "@/auth/config.js";

import { db } from "@llmgateway/db";
import { accountBlockMessage } from "@llmgateway/shared/account-block";

import { activity } from "./activity.js";
import { adminBenchmarks } from "./admin-benchmarks.js";
import { adminContentFilter } from "./admin-content-filter.js";
import { adminLicense } from "./admin-license.js";
import { adminLimitHits } from "./admin-limit-hits.js";
import { adminModelVerifications } from "./admin-model-verifications.js";
import { adminOrgDetails } from "./admin-org-details.js";
import adminProviderCredentials from "./admin-provider-credentials.js";
import { adminRoutingAnalytics } from "./admin-routing-analytics.js";
import admin from "./admin.js";
import { analytics } from "./analytics.js";
import { customModels } from "./custom-models.js";
import keysApi from "./keys-api.js";
import { logs } from "./logs.js";
import { notifications } from "./notifications.js";
import organization from "./organization.js";
import { payments } from "./payments.js";
import projects from "./projects.js";
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
		columns: { status: true, blockReason: true },
	});
	if (user?.status === "deactivated") {
		return c.json({ message: accountBlockMessage(user.blockReason) }, 403);
	}

	c.set("user", session.user);
	c.set("session", session.session);

	return await next();
});

routes.route("/user", user);
routes.route("/notifications", notifications);

routes.route("/logs", logs);

routes.route("/activity", activity);

routes.route("/admin", adminLicense);
routes.route("/admin", admin);
routes.route("/admin", adminProviderCredentials);
routes.route("/admin", adminOrgDetails);
routes.route("/admin", adminRoutingAnalytics);
routes.route("/admin", adminContentFilter);
routes.route("/admin", adminLimitHits);
routes.route("/admin", adminBenchmarks);
routes.route("/admin", adminModelVerifications);

routes.route("/analytics", analytics);

routes.route("/keys", keysApi);
routes.route("/projects", projects);

routes.route("/orgs", organization);
routes.route("/team", team);
routes.route("/payments", payments);
routes.route("/routing-config", routingConfig);
routes.route("/custom-models", customModels);
