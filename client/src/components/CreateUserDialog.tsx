import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";

// Mirrors the checks in POST /api/users (server/src/routes/users.ts).
const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const createUser = useMutation({
    mutationFn: (values: CreateUserValues) => api.post("/users", values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Start from a clean form each time the dialog opens.
    if (next) {
      reset();
      createUser.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New user
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit((values) => createUser.mutate(values))} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>Create an agent account. They can sign in with this email and password.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {createUser.error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{apiErrorMessage(createUser.error)}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="new-user-name">Name</FieldLabel>
              <Input
                id="new-user-name"
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "new-user-name-error" : undefined}
                {...register("name")}
              />
              <FieldError id="new-user-name-error" errors={[errors.name]} />
            </Field>
            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
              <Input
                id="new-user-email"
                type="email"
                autoComplete="off"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "new-user-email-error" : undefined}
                {...register("email")}
              />
              <FieldError id="new-user-email-error" errors={[errors.email]} />
            </Field>
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="new-user-password">Password</FieldLabel>
              <Input
                id="new-user-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "new-user-password-error" : undefined}
                {...register("password")}
              />
              <FieldError id="new-user-password-error" errors={[errors.password]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
