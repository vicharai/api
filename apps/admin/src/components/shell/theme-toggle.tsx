"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@llmgateway/shared/components";

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Theme">
					<Sun className="dark:hidden" />
					<Moon className="hidden dark:block" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={theme ?? "system"}
					onValueChange={setTheme}
				>
					<DropdownMenuRadioItem value="light">
						<Sun className="mr-2 size-4" /> Light
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">
						<Moon className="mr-2 size-4" /> Dark
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">
						<Monitor className="mr-2 size-4" /> System
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
