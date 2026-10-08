import { Suspense } from "react";

import { GitHubStars } from "./github-stars";
import { Hero } from "./hero";

export const HeroRSC = ({
	navbarOnly,
	sticky = true,
}: {
	navbarOnly?: boolean;
	sticky?: boolean;
}) => {
	const githubStars = (
		<Suspense fallback={<span className="block h-8 w-16" aria-hidden />}>
			<GitHubStars />
		</Suspense>
	);

	return (
		<Hero navbarOnly={navbarOnly} sticky={sticky}>
			{githubStars}
		</Hero>
	);
};
