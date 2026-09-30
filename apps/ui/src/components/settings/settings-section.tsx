import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
	/** Header label shown in the frame's top strip. */
	title: React.ReactNode;
	/** Optional muted line under the title. */
	description?: React.ReactNode;
	/** Right side of the header strip — switches, badges, actions. */
	action?: React.ReactNode;
	className?: string;
	/** Extra classes for the recessed panel. */
	panelClassName?: string;
	/** Panel contents. Omit for a strip-only section (e.g. a lone switch). */
	children?: React.ReactNode;
}

/**
 * Settings page card: squircle frame with a title strip on top and a
 * recessed squircle panel holding the form fields.
 */
export function SettingsSection({
	title,
	description,
	action,
	className,
	panelClassName,
	children,
}: SettingsSectionProps) {
	return (
		<SquircleSurface
			className={cn("border border-border p-1 shadow-sm", className)}
		>
			<div className="flex flex-wrap items-start justify-between gap-3 pb-2 pl-3.5 pr-2 pt-1.5">
				<div className="ml-1 min-w-0">
					<h2 className="text-sm font-medium text-foreground/80">{title}</h2>
					{description ? (
						<p className="mt-0.5 text-xs text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{action}
			</div>
			{children !== undefined && children !== null ? (
				<SquirclePanel className={cn("p-4 sm:p-5", panelClassName)}>
					{children}
				</SquirclePanel>
			) : null}
		</SquircleSurface>
	);
}
