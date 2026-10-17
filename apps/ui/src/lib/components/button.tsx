import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-[0.01em] transition-[color,background-color,border-color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-brand-hover hover:shadow-elevation-1",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-elevation-1 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
				outline:
					"border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
				secondary: "bg-brand-soft text-brand-strong hover:shadow-elevation-1",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				link: "rounded-md text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-5 py-2 has-[>svg]:pl-4 has-[>svg]:pr-5",
				sm: "h-8 gap-1.5 px-4 has-[>svg]:pl-3 has-[>svg]:pr-3.5",
				lg: "h-10 px-6 has-[>svg]:pl-4 has-[>svg]:pr-5",
				icon: "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
