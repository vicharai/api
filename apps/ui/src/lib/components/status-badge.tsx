import { cn } from "@/lib/utils";

interface StatusBadgeProps {
	status: "active" | "inactive" | "deleted" | null;
	variant?: "simple" | "detailed";
}

export function StatusBadge({
	status,
	variant = "detailed",
}: StatusBadgeProps) {
	const statusText = status && status.charAt(0).toUpperCase() + status.slice(1);

	const getStatusConfig = () => {
		switch (status) {
			case "active":
				return {
					dotClassName: "bg-success",
					className: "text-success",
				};
			case "inactive":
				return {
					dotClassName: "bg-muted-foreground/50",
					className: "text-muted-foreground",
				};
			default:
				return {
					dotClassName: "bg-warning",
					className: "text-muted-foreground",
				};
		}
	};

	const config = getStatusConfig();

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-xs font-medium",
				config.className,
				variant === "simple" && "text-foreground",
			)}
		>
			<span className={cn("size-1.5 rounded-full", config.dotClassName)} />
			{statusText}
		</span>
	);
}
