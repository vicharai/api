import { useId } from "react";

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

/** Four-colour Vichar mark: the cloud split into Google blue, red, yellow and green bands. */
export function VicharMarkColor(props: SVGProps<SVGSVGElement>) {
	const clipId = `vichar-mark-${useId().replace(/:/g, "")}`;
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			{...props}
		>
			<defs>
				<clipPath id={clipId}>
					<path
						transform="translate(0 0.6)"
						d="M17.5 18.4H9a7 7 0 1 1 6.71-8.7h1.79a4.35 4.35 0 1 1 0 8.7Z"
					/>
				</clipPath>
			</defs>
			<g clipPath={`url(#${clipId})`}>
				<rect x="0" y="0" width="9" height="12.5" fill="#4285F4" />
				<rect x="9" y="0" width="15" height="12.5" fill="#EA4335" />
				<rect x="0" y="12.5" width="9" height="12" fill="#34A853" />
				<rect x="9" y="12.5" width="15" height="12" fill="#FBBC04" />
			</g>
		</svg>
	);
}
