import { Skeleton } from "@/lib/components/skeleton";
import { SquircleCard } from "@/lib/components/squircle";

export function SettingsLoading() {
	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="space-y-1.5">
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-4 w-64 opacity-60" />
				</div>

				{[1, 2, 3].map((i) => (
					<SquircleCard
						key={i}
						title={<Skeleton className="h-4 w-32" />}
						hideSeeAll
						panelClassName="space-y-4 p-4 sm:p-5"
					>
						<Skeleton className="h-4 w-72 opacity-60" />
						<Skeleton className="h-10 w-full max-w-md rounded-xl" />
						<div className="flex justify-end">
							<Skeleton className="h-9 w-28 rounded-lg" />
						</div>
					</SquircleCard>
				))}
			</div>
		</div>
	);
}
