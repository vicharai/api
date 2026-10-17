import type { SVGProps } from "react";

/** Vichar mark: a single filled cloud silhouette. */
export function VicharMark(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			{...props}
		>
			<g transform="translate(0 0.6)">
				<path
					d="M17.5 18.4H9a7 7 0 1 1 6.71-8.7h1.79a4.35 4.35 0 1 1 0 8.7Z"
					fill="currentColor"
				/>
			</g>
		</svg>
	);
}
