import { IpClusters } from "@/components/fraud/clusters";
import { PageHeader } from "@/components/ui/page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "IP clusters" };

export default function FraudClustersPage() {
	return (
		<>
			<PageHeader
				title="IP clusters"
				description="Session IPs shared by many distinct accounts."
			/>
			<IpClusters />
		</>
	);
}
