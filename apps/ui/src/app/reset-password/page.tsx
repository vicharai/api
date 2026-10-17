"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, LinkIcon, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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

const formSchema = z
	.object({
		password: z.string().min(12, {
			message: "Password must be at least 12 characters",
		}),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	});

function ResetPasswordForm() {
	const queryClient = useQueryClient();
	const searchParams = useSearchParams();
	const router = useRouter();
	const authClient = useAuthClient();
	const [isLoading, setIsLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const token = searchParams.get("token");
	const errorParam = searchParams.get("error");

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: { password: "", confirmPassword: "" },
	});

	async function onSubmit(values: z.infer<typeof formSchema>) {
		if (!token) {
			toast({
				title: "Missing reset token. Request a new reset link.",
				variant: "destructive",
			});
			return;
		}
		setIsLoading(true);
		try {
			const { error } = await authClient.resetPassword({
				newPassword: values.password,
				token,
			});

			if (error) {
				toast({
					title: error.message ?? "Failed to reset password",
					variant: "destructive",
				});
				return;
			}

			queryClient.clear();
			toast({
				title: "Password updated",
				description: "Sign in with your new password.",
			});
			router.push("/login");
		} catch (err) {
			toast({
				title: err instanceof Error ? err.message : "Failed to reset password",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}

	const isInvalidToken = !token || errorParam === "INVALID_TOKEN";

	return (
		<div className="w-full">
			{isInvalidToken ? (
				<div className="flex flex-col">
					<AuthHeader
						icon={<LinkIcon />}
						tone="destructive"
						title="Reset link invalid or expired"
						description="This password reset link is no longer valid. Request a new one to continue."
					/>
					<Button asChild className="mt-8 w-full">
						<Link href="/forgot-password">Request a new link</Link>
					</Button>
				</div>
			) : (
				<div className="flex flex-col">
					<AuthHeader
						title="Set a new password"
						description="Choose a strong password with at least 12 characters."
					/>

					<div className="mt-8">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="space-y-4"
							>
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>New password</FormLabel>
											<FormControl>
												<div className="relative">
													<Input
														placeholder="••••••••"
														type={showPassword ? "text" : "password"}
														autoComplete="new-password"
														className="pr-10"
														{...field}
													/>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
														onClick={() => setShowPassword(!showPassword)}
													>
														{showPassword ? (
															<EyeOff className="h-4 w-4 text-muted-foreground" />
														) : (
															<Eye className="h-4 w-4 text-muted-foreground" />
														)}
														<span className="sr-only">
															{showPassword ? "Hide password" : "Show password"}
														</span>
													</Button>
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="confirmPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Confirm password</FormLabel>
											<FormControl>
												<Input
													placeholder="••••••••"
													type={showPassword ? "text" : "password"}
													autoComplete="new-password"
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
											Updating password...
										</>
									) : (
										<>
											Update password
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

export default function ResetPassword() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-[200px] items-center justify-center">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			}
		>
			<ResetPasswordForm />
		</Suspense>
	);
}
