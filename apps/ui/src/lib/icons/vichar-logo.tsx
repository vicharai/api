import type { SVGProps } from "react";

/**
 * Vichar mark: two provider routes converging through a single gateway node
 * into one downstream stem — the product's job drawn as a glyph, and a V/Y
 * silhouette for the name.
 */
export function VicharMark(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			{...props}
		>
			<path
				d="M4.5 4C4.5 8.4 7.8 11 12 12.6"
				stroke="currentColor"
				strokeWidth="2.3"
				strokeLinecap="round"
			/>
			<path
				d="M19.5 4C19.5 8.4 16.2 11 12 12.6"
				stroke="currentColor"
				strokeWidth="2.3"
				strokeLinecap="round"
			/>
			<path
				d="M12 12.6V20"
				stroke="currentColor"
				strokeWidth="2.3"
				strokeLinecap="round"
			/>
			<circle cx="12" cy="12.6" r="2.2" fill="currentColor" />
		</svg>
	);
}
