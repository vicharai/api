/** Named shapes of admin endpoints, derived from the generated OpenAPI types. */
import type { paths } from "./v1";

export type AdminPaths = paths;

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

export type RoutingOverride = JsonOf<
	"/admin/routing-overrides",
	"get"
>["overrides"][number];
export type RoutingOverrideScope = RoutingOverride["scope"];

export type AdminNote = JsonOf<"/admin/notes", "get">["notes"][number];
export type AdminTargetType = NonNullable<
	paths["/admin/notes"]["get"]["parameters"]["query"]
>["targetType"];

export type Announcement = JsonOf<
	"/admin/announcements",
	"get"
>["announcements"][number];
export type AnnouncementSegment = Announcement["segment"];
export type SegmentType = AnnouncementSegment["type"];

export type PlatformControls = JsonOf<
	"/admin/settings/platform-controls",
	"get"
>;
export type SignupMode = PlatformControls["signupMode"];

export type AdminDigestSettings = JsonOf<"/admin/settings/admin-digest", "get">;

export type ActivityEvent = JsonOf<
	"/admin/activity-feed",
	"get"
>["events"][number];
export type ActivityType = ActivityEvent["type"];

export type SystemHealth = JsonOf<"/admin/system/health", "get">;
export type HealthCheck = SystemHealth["checks"][number];

export type CacheScope = NonNullable<
	paths["/admin/cache/invalidate"]["post"]["requestBody"]
>["content"]["application/json"]["scope"];
