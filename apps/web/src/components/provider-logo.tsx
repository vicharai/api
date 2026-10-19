import dimensions from "@/lib/provider-logo-dimensions.json";

interface ProviderLogoProps {
	id: string;
	className?: string;
}

/** Render a lab logo from the copied provider sprite (`/provider-logos.svg`),
 * or the lab's initial when the sprite has no logo for it. */
export function ProviderLogo({ id, className }: ProviderLogoProps) {
	const dim = (dimensions as Record<string, { viewBox?: string }>)[id];
	if (!dim) {
		return (
			<span
				aria-hidden="true"
				className={`inline-flex items-center justify-center text-[11px] font-semibold uppercase leading-none ${className ?? ""}`}
			>
				{id.charAt(0) || "·"}
			</span>
		);
	}
	return (
		<svg
			viewBox={dim.viewBox ?? "0 0 24 24"}
			className={className}
			aria-hidden="true"
		>
			<use href={`/provider-logos.svg#${id}`} />
		</svg>
	);
}

export function hasProviderLogo(id: string): boolean {
	return id in (dimensions as Record<string, unknown>);
}
