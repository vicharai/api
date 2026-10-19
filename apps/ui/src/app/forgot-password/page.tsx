"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthHeader, authLinkClass } from "@/components/auth/auth-shell";
import { useAuthClient } from "@/lib/auth-client";
import { Button } from "@/lib/components/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/lib/components/form";
import { Input } from "@/lib/components/input";
import { toast } from "@/lib/components/use-toast";

const formSchema = z.object({
	email: z.string().email({
		message: "Please enter a valid email address",
	}),
});

export default function ForgotPassword() {
	const [isLoading, setIsLoading] = useState(false);
	const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
	const authClient = useAuthClient();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: { email: "" },
	});

	async function onSubmit(values: z.infer<typeof formSchema>) {
		setIsLoading(true);
		const redirectTo = `${window.location.origin}/reset-password`;

		try {
			const { error } = await authClient.requestPasswordReset({
				email: values.email,
				redirectTo,
			});

			if (error) {
				toast({
					title: error.message ?? "Failed to send reset email",
					variant: "destructive",
				});
				return;
			}

			setSubmittedEmail(values.email);
		} catch (err) {
			toast({
				title:
					err instanceof Error ? err.message : "Failed to send reset email",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="w-full">
			{submittedEmail ? (
				<div className="flex flex-col">
					<AuthHeader
						icon={<MailCheck />}
						tone="success"
						title="Check your email"
						description={
							<>
								If an account exists for{" "}
								<span className="font-medium text-foreground">
									{submittedEmail}
								</span>
								, we&apos;ve sent a password reset link. The link expires in 1
								hour.
							</>
						}
					/>
					<p className="mt-4 text-sm text-muted-foreground">
						Didn&apos;t get it? Check your spam folder, or{" "}
						<button
							type="button"
							onClick={() => setSubmittedEmail(null)}
							className={authLinkClass}
						>
							try again
						</button>
						.
					</p>
					<Button asChild variant="outline" className="mt-8 w-full">
						<Link href="/login">
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to sign in
						</Link>
					</Button>
				</div>
			) : (
				<div className="flex flex-col">
					<AuthHeader
						title="Forgot your password?"
						description="Enter your email and we'll send you a link to reset it."
					/>

					<div className="mt-8">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="space-y-4"
							>
								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Email</FormLabel>
											<FormControl>
												<Input
													placeholder="name@example.com"
													type="email"
													autoComplete="email"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<Button type="submit" className="w-full" disabled={isLoading}>
									{isLoading ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Sending reset link...
										</>
									) : (
										<>
											Send reset link
											<ArrowRight className="ml-2 h-4 w-4" />
										</>
									)}
								</Button>
							</form>
						</Form>
					</div>

					<p className="mt-6 text-center text-sm">
						<Link href="/login" className={authLinkClass}>
							Back to sign in
						</Link>
					</p>
				</div>
			)}
		</div>
	);
}
