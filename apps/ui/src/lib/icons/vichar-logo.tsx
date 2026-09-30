import type { SVGProps } from "react";

/**
 * Vichar mark: a simple thought cloud — a filled bubble with trailing
 * dots so it reads as thinking rather than weather.
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
				d="M17.5 18.4H9a7 7 0 1 1 6.71-8.7h1.79a4.35 4.35 0 1 1 0 8.7Z"
				fill="currentColor"
			/>
			<circle cx="7.4" cy="20.9" r="1.15" fill="currentColor" />
			<circle cx="4.9" cy="22.6" r="0.78" fill="currentColor" />
		</svg>
	);
}
