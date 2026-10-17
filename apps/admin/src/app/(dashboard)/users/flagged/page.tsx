import { FlaggedAccounts } from "@/components/users/flagged-accounts";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Flagged accounts" };

export default function FlaggedPage() {
	return <FlaggedAccounts />;
}
