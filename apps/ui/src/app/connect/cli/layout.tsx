import { VicharMark } from "@/lib/icons/vichar-logo";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Connect CLI",
	description: "Authorize a coding CLI to access your Vichar account.",
	robots: { index: false, follow: false },
};

export default function ConnectCliLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
			<div className="w-full max-w-md">
				<div className="mb-6 flex items-center justify-center gap-2.5">
					<VicharMark className="size-7 text-brand" />
					<span className="text-base font-medium tracking-tight">Vichar</span>
				</div>
				{children}
			</div>
		</div>
	);
}
