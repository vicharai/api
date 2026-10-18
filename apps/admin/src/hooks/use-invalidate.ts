import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * Invalidates every openapi-react-query query whose path starts with one of
 * the prefixes. Query keys are `[method, path, init]`.
 */
export function useInvalidate() {
	const queryClient = useQueryClient();

	return useCallback(
		(...prefixes: string[]) =>
			queryClient.invalidateQueries({
				predicate: (query) => {
					const path = query.queryKey[1];
					return (
						typeof path === "string" &&
						prefixes.some((prefix) => path.startsWith(prefix))
					);
				},
			}),
		[queryClient],
	);
}
