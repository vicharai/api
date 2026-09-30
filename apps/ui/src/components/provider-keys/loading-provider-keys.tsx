import { MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/lib/components/button";
import { Skeleton } from "@/lib/components/skeleton";
import { SquircleCard } from "@/lib/components/squircle";

export default function LoadingProviderKeys() {
	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<h1 className="text-xl font-medium tracking-tight">
							Provider Keys
						</h1>
						<p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
							Bring your own provider API keys to use them through Vichar
							without additional fees.
						</p>
					</div>
					<Button disabled>
						<Plus className="mr-2 h-4 w-4" />
						Add Provider Key
					</Button>
				</div>
				<Skeleton className="h-10 w-full rounded-xl" />
				<SquircleCard
					title="Your providers"
					hideSeeAll
					panelClassName="space-y-3 p-3"
				>
					{Array.from({ length: 2 }).map((_, index) => (
						<div
							key={`loading-provider-${index}`}
							className="rounded-xl border border-border bg-card"
						>
							<div className="flex items-center justify-between gap-3 p-3">
								<div className="flex min-w-0 items-center gap-2.5">
									<Skeleton className="h-9 w-9 rounded-lg" />
									<Skeleton className="h-4 w-24" />
								</div>
								<Button variant="ghost" size="sm" disabled>
									<Plus className="mr-1.5 h-4 w-4" />
									Add key
								</Button>
							</div>
							<div className="border-t border-border">
								<div className="flex items-center justify-between gap-3 px-3 py-2.5">
									<div className="flex min-w-0 flex-1 items-center gap-2">
										<Skeleton className="h-5 w-14 rounded-full" />
										<Skeleton className="h-4 w-40" />
									</div>
									<Button
										variant="ghost"
										size="sm"
										className="shrink-0"
										disabled
									>
										<MoreHorizontal className="h-4 w-4" />
										<span className="sr-only">Open menu</span>
									</Button>
								</div>
							</div>
						</div>
					))}
				</SquircleCard>
			</div>
		</div>
	);
}
