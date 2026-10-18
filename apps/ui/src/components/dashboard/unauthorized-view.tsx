import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { StatusCard } from "@/components/auth/auth-shell";
import { Button } from "@/lib/components/button";

interface UnauthorizedViewProps {
	resource?: "workspace" | "project";
}

export function UnauthorizedView({
	resource = "workspace",
}: UnauthorizedViewProps) {
	return (
		<StatusCard
			icon={<ShieldAlert />}
			tone="warning"
			title="Unauthorized"
			description={`You don't have access to this ${resource}, or it doesn't exist.`}
		>
			<Button asChild className="w-full">
				<Link href="/dashboard">Go to your dashboard</Link>
			</Button>
		</StatusCard>
	);
}
