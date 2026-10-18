import { VicharMark } from "@/lib/icons/vichar-logo";

const COPY = {
	login: {
		title: "Sign in",
		subtitle: "to continue to Vichar",
	},
	signup: {
		title: "Create your Vichar account",
		subtitle:
			"One OpenAI-compatible API for every model. No credit card required.",
	},
} as const;

/** Left column of the auth card on wide screens: product mark and headline. */
export function AuthBrandPanel({ variant }: { variant: "login" | "signup" }) {
	const copy = COPY[variant];
	return (
		<div className="hidden min-w-0 lg:flex lg:flex-col">
			<div className="flex items-center gap-2">
				<VicharMark className="size-10 text-brand" />
				<span className="text-[22px] font-medium leading-none text-muted-foreground">
					Vichar
				</span>
			</div>
			<h2 className="mt-8 text-[36px] font-normal leading-[44px] text-heading">
				{copy.title}
			</h2>
			<p className="mt-4 max-w-[26rem] text-base text-muted-foreground">
				{copy.subtitle}
			</p>
		</div>
	);
}
