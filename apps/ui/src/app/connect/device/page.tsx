import { AuthShell } from "@/components/auth/auth-shell";

import { DeviceApproval } from "./device-approval";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Authorize your device",
	robots: { index: false, follow: false },
};

export default async function DevicePage({
	searchParams,
}: {
	searchParams: Promise<{ user_code?: string }>;
}) {
	const { user_code: userCode } = await searchParams;
	return (
		<AuthShell>
			<DeviceApproval
				initialCode={typeof userCode === "string" ? userCode : ""}
			/>
		</AuthShell>
	);
}
