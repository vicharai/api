import { MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/lib/components/button";
import { Skeleton } from "@/lib/components/skeleton";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/lib/components/table";

export default function Loading() {
	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<h1 className="text-xl font-medium tracking-tight">API Keys</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Create and manage API keys to authenticate requests to Vichar
						</p>
					</div>
					<Button disabled>
						<Plus className="mr-2 h-4 w-4" />
						Create API Key
					</Button>
				</div>
				<SquircleSurface className="border border-border p-1 shadow-sm">
					<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
						<h2 className="ml-1 text-sm font-medium text-foreground/80">
							Keys
						</h2>
					</div>
					<SquirclePanel className="p-2">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="text-xs text-muted-foreground">
										Name
									</TableHead>
									<TableHead className="text-xs text-muted-foreground">
										API Key
									</TableHead>
									<TableHead className="text-xs text-muted-foreground">
										Created
									</TableHead>
									<TableHead className="text-xs text-muted-foreground">
										Last Used
									</TableHead>
									<TableHead className="text-xs text-muted-foreground">
										Status
									</TableHead>
									<TableHead className="text-xs text-muted-foreground">
										Restrictions
									</TableHead>
									<TableHead className="sticky right-0 w-12 bg-panel" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{Array.from({ length: 4 }).map((_, index) => (
									<TableRow
										key={`skeleton-api-key-${index}`}
										className="hover:bg-transparent"
									>
										<TableCell>
											<Skeleton className="h-4 w-24" />
										</TableCell>
										<TableCell>
											<Skeleton className="h-4 w-[167px]" />
										</TableCell>
										<TableCell>
											<Skeleton className="h-4 w-[199px]" />
										</TableCell>
										<TableCell>
											<Skeleton className="h-4 w-[199px]" />
										</TableCell>
										<TableCell>
											<Skeleton className="h-4 w-16" />
										</TableCell>
										<TableCell>
											<Skeleton className="h-4 w-[144px]" />
										</TableCell>
										<TableCell className="sticky right-0 bg-panel text-center">
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												disabled
											>
												<MoreHorizontal className="h-4 w-4" />
												<span className="sr-only">Open menu</span>
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</SquirclePanel>
				</SquircleSurface>
			</div>
		</div>
	);
}
