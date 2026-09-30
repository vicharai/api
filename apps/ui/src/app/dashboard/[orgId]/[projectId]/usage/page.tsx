import { redirect } from "next/navigation";

export default async function UsagePage({
	params,
	searchParams,
}: {
	params: Promise<{ orgId: string; projectId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [{ orgId, projectId }, query] = await Promise.all([
		params,
		searchParams,
	]);

	const qs = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (typeof value === "string") {
			qs.set(key, value);
		} else if (Array.isArray(value)) {
			for (const v of value) {
				qs.append(key, v);
			}
		}
	}
	qs.set("tab", "usage");

	redirect(`/dashboard/${orgId}/${projectId}/analytics?${qs.toString()}`);
}
