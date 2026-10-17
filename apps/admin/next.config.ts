import { join } from "path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	outputFileTracingRoot: join(__dirname, "../../"),
	distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
	output: "standalone",
	productionBrowserSourceMaps: true,
	typedRoutes: true,
	reactStrictMode: true,
	reactCompiler: true,
	poweredByHeader: false,
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
			},
		];
	},
	typescript: {
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
