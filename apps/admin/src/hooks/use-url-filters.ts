import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { Route } from "next";

/**
 * Filter state kept in the query string so it survives reloads and can be
 * shared as a link. Values equal to their default are left out of the URL.
 * Pages using it must render inside a `<Suspense>` boundary.
 */
export function useUrlFilters<T extends Record<string, string>>(
	defaults: T,
): [T, (patch: Partial<T>) => void] {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const defaultsKey = JSON.stringify(defaults);

	const values = useMemo(() => {
		const base = JSON.parse(defaultsKey) as T;
		const next: Record<string, string> = { ...base };
		for (const key of Object.keys(base)) {
			const value = params.get(key);
			if (value !== null) {
				next[key] = value;
			}
		}
		return next as T;
	}, [params, defaultsKey]);

	const setValues = useCallback(
		(patch: Partial<T>) => {
			const base = JSON.parse(defaultsKey) as T;
			const next = new URLSearchParams(params.toString());
			for (const [key, value] of Object.entries(patch)) {
				if (value === undefined || value === "" || value === base[key]) {
					next.delete(key);
				} else {
					next.set(key, value);
				}
			}
			const query = next.toString();
			router.replace((query ? `${pathname}?${query}` : pathname) as Route, {
				scroll: false,
			});
		},
		[params, pathname, router, defaultsKey],
	);

	return [values, setValues];
}
