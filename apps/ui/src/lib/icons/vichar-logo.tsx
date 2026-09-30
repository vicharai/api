import type { SVGProps } from "react";

/**
 * Vichar mark: a thought bubble whose cloud holds a constellation of three
 * nodes joined in a shallow V — thoughts converging into one. The trailing
 * dots make it read as a thinking cloud rather than weather.
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
			<path
				d="M8.8 11.6 11.9 14.8 15.2 11.4"
				stroke="#fff"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
			<circle cx="8.8" cy="11.6" r="1.25" fill="#fff" />
			<circle cx="11.9" cy="14.8" r="1.25" fill="#fff" />
			<circle cx="15.2" cy="11.4" r="1.25" fill="#fff" />
			<circle cx="7.4" cy="20.9" r="1.15" fill="currentColor" />
			<circle cx="4.9" cy="22.6" r="0.78" fill="currentColor" />
		</svg>
	);
}
