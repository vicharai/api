import { AuthShell } from "@/components/auth/auth-shell";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Onboarding",
	description: "Set up your Vichar account.",
	robots: { index: false, follow: false },
};

export default function OnboardingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <AuthShell width="wide">{children}</AuthShell>;
}
