import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate } from "react-router";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { authClient } from "@/lib/auth-client.ts";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { data: session, isPending } = authClient.useSession();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (isPending) {
    return <p className="mt-24 text-center text-muted-foreground">Loading…</p>;
  }
  if (session) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit({ email, password }: LoginValues) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError("root", { message: error.message ?? "Sign in failed. Please try again." });
    }
    // On success the session store refetches and the <Navigate> above redirects to the home page.
  }

  // Keep the button disabled after a successful sign-in until the redirect happens.
  const busy = isSubmitting || (isSubmitSuccessful && !errors.root);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to HelpDesk</CardTitle>
          <CardDescription>Enter your email and password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              {errors.root && (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertDescription>{errors.root.message}</AlertDescription>
                </Alert>
              )}
              <Field data-invalid={errors.email ? true : undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
                <FieldError id="email-error" errors={[errors.email]} />
              </Field>
              <Field data-invalid={errors.password ? true : undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  {...register("password")}
                />
                <FieldError id="password-error" errors={[errors.password]} />
              </Field>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
