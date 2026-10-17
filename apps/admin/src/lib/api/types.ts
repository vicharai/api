import type { AdminPaths } from "./admin-types";

type Method = "get" | "post" | "put" | "patch" | "delete";

/** The JSON body of a 200 response for `method path`. */
export type ApiData<P extends keyof AdminPaths, M extends Method = "get"> =
	AdminPaths[P] extends Record<M, infer Op>
		? Op extends {
				responses: { 200: { content: { "application/json": infer R } } };
			}
			? R
			: never
		: never;
