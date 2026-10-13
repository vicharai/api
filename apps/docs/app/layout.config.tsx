import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
	themeSwitch: {
		mode: "light-dark-system",
	},
	nav: {
		url: "/",
		title: (
			<>
				<svg
					fill="currentColor"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					className="h-6 w-6 text-[#305dde]"
				>
					<path d="M17.5 18.4H9a7 7 0 1 1 6.71-8.7h1.79a4.35 4.35 0 1 1 0 8.7Z" />
				</svg>
				Vichar Docs
			</>
		),
	},
	links: [
		{
			text: "vichar.io",
			url: "https://vichar.io",
			active: "none",
		},
		{
			text: "Dashboard",
			url: "https://app.vichar.io",
			active: "none",
		},
	],
};
