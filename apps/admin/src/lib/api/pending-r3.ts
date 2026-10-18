/**
 * Round-3 endpoints typed from the agreed contract until the backend branches
 * land and `pnpm --filter admin generate` produces them. Delete this file and
 * its use in admin-types.ts once the generated types cover every path here.
 */
import type { paths } from "./v1";

type Method = "get" | "put" | "post" | "delete" | "patch";
type AnyMethod = Method | "options" | "head" | "trace";

interface Json<R> {
	headers: { [name: string]: unknown };
	content: { "application/json": R };
}

type Op<
	R,
	Q = never,
	P = never,
	B = never,
	C extends string = "application/json",
> = {
	parameters: {
		query?: Q;
		header?: never;
		cookie?: never;
	} & ([P] extends [never] ? { path?: never } : { path: P });
	responses: {
		200: C extends "application/json"
			? Json<R>
			: { headers: { [name: string]: unknown }; content: Record<C, R> };
	};
} & ([B] extends [never]
	? { requestBody?: never }
	: { requestBody: { content: { "application/json": B } } });

type Item<T extends Partial<Record<Method, unknown>>> = T &
	Partial<Record<Exclude<AnyMethod, keyof T>, never>> & {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
	};

// ---- Config registry (agent 2) ----

export type ConfigFieldType =
	"number" | "string" | "boolean" | "stringList" | "json";

export interface PlatformConfigEntry {
	key: string;
	category: string;
	label: string;
	description: string;
	type: ConfigFieldType;
	unit: string | null;
	min: number | null;
	max: number | null;
	options: string[] | null;
	nullable: boolean;
	default: unknown;
	value: unknown;
	source: "db" | "env" | "default";
	env: string | null;
	secret: false;
}

export interface PlatformConfig {
	categories: { id: string; label: string }[];
	entries: PlatformConfigEntry[];
}

export interface PendingR3Paths {
	"/admin/settings/config": Item<{
		get: Op<PlatformConfig>;
		put: Op<
			PlatformConfig,
			never,
			never,
			{ values: { [key: string]: unknown } }
		>;
	}>;
	"/admin/settings/config/{key}": Item<{
		delete: Op<PlatformConfig, never, { key: string }>;
	}>;
}

/** Generated paths with the round-3 contract layered on top. */
export type PathsWithPending = Omit<paths, keyof PendingR3Paths> &
	PendingR3Paths;
