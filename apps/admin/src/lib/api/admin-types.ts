/** Named shapes of admin endpoints, derived from the generated OpenAPI types. */
import type { WithPhaseTwoPaths } from "./pending-paths-p2";
import type { paths } from "./v1";

export type AdminPaths = WithPhaseTwoPaths<paths>;

type JsonOf<
	P extends keyof paths,
	M extends keyof paths[P],
> = paths[P][M] extends {
	responses: { 200: { content: { "application/json": infer R } } };
}
	? R
	: never;

export type AdminAuditEntry = JsonOf<
	"/admin/audit-logs",
	"get"
>["entries"][number];

export type AdminTeamMember = JsonOf<"/admin/team", "get">["members"][number];

export type PaymentMethodRow = JsonOf<
	"/admin/organizations/{orgId}/payment-methods",
	"get"
>["paymentMethods"][number];

export type RateLimitRow = JsonOf<
	"/admin/rate-limits",
	"get"
>["rateLimits"][number];

export type ErrorRateAlertSettings = JsonOf<
	"/admin/settings/model-error-rate-alerts",
	"get"
>;

export type LoadOverview = JsonOf<"/admin/load/overview", "get">;
export type LoadWindow = LoadOverview["window"];
export type LoadGroupBy = LoadOverview["groupBy"];

export type ProviderIncidents = JsonOf<
	"/admin/providers/{providerId}/incidents",
	"get"
>;
export type IncidentWindow = "1h" | "6h" | "24h" | "7d";

export type ProviderAccess = JsonOf<
	"/admin/organizations/{orgId}/provider-access",
	"get"
>;

export type CrmAccountDetail = JsonOf<"/admin/crm/accounts/{id}", "get">;
export type CrmAccount = CrmAccountDetail["account"];
export type CrmContact = CrmAccountDetail["contacts"][number];
export type CrmActivity = CrmAccountDetail["activities"][number];
export type CrmStage = CrmAccount["stage"];
export type CrmSegment = CrmAccount["segment"];
export type CrmPriority = CrmAccount["priority"];
export type CrmActivityType = CrmActivity["type"];
export type CrmAccountBody = NonNullable<
	paths["/admin/crm/accounts/{id}"]["patch"]["requestBody"]
>["content"]["application/json"];
