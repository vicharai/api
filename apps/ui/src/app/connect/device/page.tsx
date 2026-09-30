import { VicharMark } from "@/lib/icons/vichar-logo";

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
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
			<div className="w-full max-w-md">
				<div className="mb-6 flex items-center justify-center gap-2.5">
					<VicharMark className="size-7 text-brand" />
					<span className="text-base font-medium tracking-tight">Vichar</span>
				</div>
				<DeviceApproval
					initialCode={typeof userCode === "string" ? userCode : ""}
				/>
			</div>
		</div>
	);
}
