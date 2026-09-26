import { logoPaths } from "./logo-paths";

export type LogoProps = React.HTMLAttributes<SVGElement>;

export const Logo = (props: LogoProps) => (
	<svg
		fill="none"
		{...props}
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 218 232"
	>
		{logoPaths.map((d) => (
			<path key={d} d={d} fill="currentColor" />
		))}
	</svg>
);

export const LogoLockup = (props: LogoProps) => (
	<svg
		role="img"
		aria-label="Vichar"
		fill="currentColor"
		{...props}
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 900 232"
	>
		{logoPaths.map((d) => (
			<path key={d} d={d} />
		))}
		<text
			x="264"
			y="168"
			fontFamily="Inter, system-ui, sans-serif"
			fontWeight="700"
			fontSize="170"
		>
			Vichar
		</text>
	</svg>
);
