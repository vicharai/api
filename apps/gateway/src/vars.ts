import type { Env } from "hono/types";

export interface ServerTypes extends Env {
	Variables: {
		traceId?: string;
		spanId?: string;
		/**
		 * Tracks the request's open allowance reservation so `app.onError` can
		 * release the hold when the request is rejected locally before any
		 * upstream dispatch. `dispatched` flips true right before the upstream
		 * fetch; after that the outcome is possibly billable and the hold must
		 * settle through the worker instead.
		 */
		allowanceReservation?: {
			id: string | null;
			dispatched: boolean;
		};
	};
}
