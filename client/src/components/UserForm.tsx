import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";

// Mirrors the checks in POST /api/users and PATCH /api/users/:id (server/src/routes/users.ts).
const passwordRule = z.string().min(8, "Password must be at least 8 characters");
const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address")),
  password: passwordRule,
});
// When editing, a blank password keeps the current one.
const editUserSchema = createUserSchema.extend({ password: z.union([z.literal(""), passwordRule]) });

type UserFormValues = z.infer<typeof createUserSchema>;

// The fields of a user that the form edits (a subset of GET /api/users' users).
export type EditableUser = { id: string; name: string; email: string };

type UserFormProps = {
  // The user to edit, or null to create a new agent.
  user: EditableUser | null;
  onSaved: () => void;
};

// Creates or edits a user. Render it inside DialogContent: the dialog unmounts it on close, so every opening
// starts again from the user's details, with no error from the last attempt.
export function UserForm({ user, onSaved }: UserFormProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(user ? editUserSchema : createUserSchema),
    defaultValues: { name: user?.name ?? "", email: user?.email ?? "", password: "" },
  });

  const saveUser = useMutation({
    // When editing, a blank password means "keep the current one", which the API expects as no password at all.
    mutationFn: async (values: UserFormValues) => {
      if (!user) {
        await api.post("/users", values);
        return;
      }
      const { password, ...details } = values;
      await api.patch(`/users/${user.id}`, password ? values : details);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      onSaved();
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => saveUser.mutate(values))} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{user ? "Edit user" : "New user"}</DialogTitle>
        <DialogDescription>
          {user
            ? "Change this user's details. Setting a new password signs them out everywhere."
            : "Create an agent account. They can sign in with this email and password."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {saveUser.error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{apiErrorMessage(saveUser.error)}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="user-name">Name</FieldLabel>
          <Input
            id="user-name"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "user-name-error" : undefined}
            {...register("name")}
          />
          <FieldError id="user-name-error" errors={[errors.name]} />
        </Field>
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="user-email">Email</FieldLabel>
          <Input
            id="user-email"
            type="email"
            autoComplete="off"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "user-email-error" : undefined}
            {...register("email")}
          />
          <FieldError id="user-email-error" errors={[errors.email]} />
        </Field>
        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="user-password">{user ? "New password" : "Password"}</FieldLabel>
          <Input
            id="user-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={
              [user && "user-password-hint", errors.password && "user-password-error"]
                .filter(Boolean)
                .join(" ") || undefined
            }
            {...register("password")}
          />
          {user && (
            <FieldDescription id="user-password-hint">Leave blank to keep the current password.</FieldDescription>
          )}
          <FieldError id="user-password-error" errors={[errors.password]} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={saveUser.isPending}>
          {saveUser.isPending ? (user ? "Saving…" : "Creating…") : user ? "Save changes" : "Create user"}
        </Button>
      </DialogFooter>
    </form>
  );
}
