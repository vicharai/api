"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { SocialAuthButtons } from "@/components/social-auth-buttons";
import { useSessionStatus, useUser } from "@/hooks/useUser";
import { useAuth } from "@/lib/auth-client";
import { useAuthErrorToast } from "@/lib/auth-errors";
import {
	getAuthPagePath,
	getAuthRedirect,
	isCliAuthRedirect,
} from "@/lib/auth-redirect";
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
import { useAppConfig } from "@/lib/config";

import type { Route } from "next";

const createFormSchema = (isHosted: boolean) =>
	z.object({
		email: isHosted
			? z
					.string()
					.email({
						message: "Please enter a valid email address",
					})
					.refine((email) => !email.split("@")[0]?.includes("+"), {
						message: "Email addresses with '+' are not allowed",
					})
			: z.string().email({
					message: "Please enter a valid email address",
				}),
		password: z.string().min(12, {
			message: "Password must be at least 12 characters",
		}),
	});

export default function Signup() {
	const queryClient = useQueryClient();
	const router = useRouter();
	const searchParams = useSearchParams();
	const redirectTarget = getAuthRedirect(searchParams.get("redirect"));
	const signupTarget =
		redirectTarget === "/dashboard" ? "/onboarding" : redirectTarget;
	const posthog = usePostHog();
	const [isLoading, setIsLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const { signUp } = useAuth();
	const config = useAppConfig();

	const formSchema = createFormSchema(config.hosted);

	const { isAuthenticated } = useSessionStatus();

	useUser({
		redirectTo: redirectTarget,
		redirectWhen: "authenticated",
		checkOnboarding: !isCliAuthRedirect(redirectTarget),
		enabled: isAuthenticated,
	});

	useEffect(() => {
		posthog.capture("page_viewed_signup");
	}, [posthog]);

	useAuthErrorToast();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	async function onSubmit(values: z.infer<typeof formSchema>) {
		setIsLoading(true);

		const verifyUrl = new URL("/verify-email", window.location.origin);
		verifyUrl.searchParams.set("email", values.email);
		verifyUrl.searchParams.set("next", signupTarget);

		const { error } = await signUp.email(
			{
				name: "",
				email: values.email,
				password: values.password,
				callbackURL: verifyUrl.toString(),
			},
			{
				onSuccess: async (ctx) => {
					queryClient.clear();
					posthog.identify(ctx.data.user.id, {
						email: ctx.data.user.email,
						name: ctx.data.user.name,
					});
					posthog.capture("user_signed_up", {
						email: values.email,
					});

					if (
						ctx.data.user.emailVerified === false ||
						ctx.data.token === null
					) {
						verifyUrl.searchParams.set("sent", "1");
						router.replace((verifyUrl.pathname + verifyUrl.search) as Route);
					} else {
						router.push(signupTarget as Route);
					}
				},
				onError: (ctx) => {
					toast({
						title: ctx?.error?.message ?? "Failed to sign up",
						variant: "destructive",
					});
				},
			},
		);

		if (error) {
			toast({
				title: error.message ?? "Failed to sign up",
				variant: "destructive",
			});
		}

		setIsLoading(false);
	}

	return (
		<div className="mx-auto w-full lg:mr-0 lg:max-w-[400px]">
			<div>
				<div className="flex flex-col space-y-2 lg:sr-only">
					<h1 className="text-[28px] font-normal leading-9 text-heading">
						Create your free account
					</h1>
					<p className="text-sm text-muted-foreground">
						No credit card required. Start building in seconds.
					</p>
				</div>

				<div className="mt-8 space-y-4">
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Password</FormLabel>
										<div className="relative">
											<FormControl>
												<Input
													placeholder="••••••••"
													type={showPassword ? "text" : "password"}
													autoComplete="new-password"
													className="pr-10"
													{...field}
												/>
											</FormControl>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
												onClick={() => setShowPassword(!showPassword)}
												tabIndex={-1}
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
										<p className="text-xs text-muted-foreground">
											Minimum 12 characters
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button type="submit" className="w-full" disabled={isLoading}>
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating account...
									</>
								) : (
									"Start free"
								)}
							</Button>
						</form>
					</Form>

					{/* Divider + social methods render only when providers are configured (same gate as SocialAuthButtons) */}
					{(config.githubAuth || config.googleAuth) && (
						<>
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t" />
								</div>
								<div className="relative flex justify-center text-xs">
									<span className="bg-background px-3 text-muted-foreground sm:bg-card">
										Or
									</span>
								</div>
							</div>
							<SocialAuthButtons
								isLoading={isLoading}
								setIsLoading={setIsLoading}
								callbackPath={redirectTarget}
								errorCallbackPath={getAuthPagePath("/signup", redirectTarget)}
								newUserCallbackPath={redirectTarget}
								requestSignUp
							/>
						</>
					)}
					<p className="text-center text-xs leading-relaxed text-muted-foreground">
						By signing up, you agree to the{" "}
						<Link
							href="/legal/terms"
							className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
						>
							Vichar Terms of Use
						</Link>
						.
					</p>
				</div>
			</div>

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Already have an account?{" "}
				<Link
					href={getAuthPagePath("/login", redirectTarget) as Route}
					className="font-medium text-brand underline-offset-4 hover:underline"
				>
					Sign in
				</Link>
			</p>
		</div>
	);
}
