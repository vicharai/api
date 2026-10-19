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

/** The JSON request body for `method path`. */
export type ApiBody<P extends keyof AdminPaths, M extends Method> =
	AdminPaths[P] extends Record<M, infer Op>
		? Op extends {
				requestBody?: { content: { "application/json": infer B } };
			}
			? B
			: never
		: never;

/** The query parameters for `GET path`. */
export type ApiQuery<P extends keyof AdminPaths> =
	AdminPaths[P] extends Record<"get", infer Op>
		? Op extends { parameters: { query?: infer Q } }
			? NonNullable<Q>
			: never
		: never;
