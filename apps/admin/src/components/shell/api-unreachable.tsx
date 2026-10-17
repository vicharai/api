import { ServerCrash } from "lucide-react";
import Link from "next/link";

import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@llmgateway/shared/components";

/** Full-page error when the admin API cannot be reached from the server. */
export function ApiUnreachable({ message }: { message: string }) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
						<ServerCrash className="size-5" />
					</div>
					<CardTitle>API unreachable</CardTitle>
					<CardDescription>
						The admin panel could not reach the Vichar API, so it cannot check
						your session or load data. Check that the API is running and that
						API_BACKEND_URL points at it.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
						{message}
					</pre>
					<div className="flex gap-2">
						<Button asChild>
							<Link href="/">Try again</Link>
						</Button>
						<Button variant="outline" asChild>
							<Link href="/login">Sign-in page</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
