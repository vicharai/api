"use client";

import { AllModels } from "@llmgateway/shared/components";

import type { paths } from "@/lib/api/v1";
import type { ApiModel, ApiProvider } from "@llmgateway/shared/components";

type ListResponse =
	paths["/custom-models"]["get"]["responses"][200]["content"]["application/json"];
export type CustomModel = ListResponse["customModels"][number];

export function OrgModelsClient({
	catalogModels,
	catalogProviders,
}: {
	catalogModels: ApiModel[];
	catalogProviders: ApiProvider[];
}) {
	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="min-w-0">
					<h1 className="text-xl font-medium tracking-tight">Models</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Every model available through Vichar, in one catalogue.
					</p>
				</div>

				<AllModels
					models={catalogModels}
					providers={catalogProviders}
					hideHeader
				>
					{null}
				</AllModels>
			</div>
		</div>
	);
}
