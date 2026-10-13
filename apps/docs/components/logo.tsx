export type LogoProps = React.SVGProps<SVGSVGElement>;

/** Vichar cloud mark (same path as the app/marketing logo). */
export const Logo = (props: LogoProps) => (
	<svg
		fill="currentColor"
		{...props}
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
	>
		<path d="M17.5 18.4H9a7 7 0 1 1 6.71-8.7h1.79a4.35 4.35 0 1 1 0 8.7Z" />
	</svg>
);
