import lint from "../../eslint.config.mjs";
import { react } from "@abinnovision/eslint-config-react";

/** @type {import("eslint").Linter.Config[]} */
export default [
	...lint,
	...react,
	{
		rules: {
			"react/no-unescaped-entities": "off",
			"@eslint-react/hooks-extra/no-direct-set-state-in-use-effect": "off",
		},
	},
	{
		ignores: ["out/**", ".next/**", ".next-dev/**"],
	},
];
