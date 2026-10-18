// Temporary: round-3 endpoint contracts until the backend branches land and
// `pnpm --filter ui generate` provides the real types. Delete afterwards.
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import { useMemo } from "react";

import { useAppConfig } from "./config";

import type { paths } from "./api/v1";

interface Json<T> {
	headers: { [name: string]: unknown };
	content: { "application/json": T };
}

interface PathItem<Op extends { method: "get" | "post"; op: unknown }> {
	parameters: {
		query?: never;
		header?: never;
		path?: never;
		cookie?: never;
	};
	get: Op["method"] extends "get" ? Op["op"] : never;
	post: Op["method"] extends "post" ? Op["op"] : never;
}

export interface PublicBillingConfig {
	topUpMin: number;
	topUpMax: number;
	topUpPresets: number[];
	platformFeePercent: number;
	autoTopUpDefaultThreshold: number;
	autoTopUpDefaultAmount: number;
}

type ContractPaths = paths & {
	"/public/config": PathItem<{
		method: "get";
		op: {
			parameters: {
				query?: never;
				header?: never;
				path?: never;
				cookie?: never;
			};
			requestBody?: never;
			responses: {
				200: Json<{
					billing?: PublicBillingConfig;
					company?: { name: string; supportEmail: string };
				}>;
			};
		};
	}>;
};

export function createContractFetchClient(baseUrl: string) {
	return createFetchClient<ContractPaths>({ baseUrl, credentials: "include" });
}

export function useContractApi() {
	const config = useAppConfig();
	return useMemo(
		() => createClient(createContractFetchClient(config.apiUrl)),
		[config.apiUrl],
	);
}
