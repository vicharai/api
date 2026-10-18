import { BenchmarksPage } from "@/components/benchmarks/benchmarks-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Benchmarks" };

export default function Page() {
	return <BenchmarksPage />;
}
