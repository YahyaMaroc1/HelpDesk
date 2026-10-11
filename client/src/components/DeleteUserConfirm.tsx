import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import type { EditableUser } from "@/components/UserForm.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";

type DeleteUserConfirmProps = {
  user: EditableUser;
  onDeleted: () => void;
};

// Asks before soft-deleting a user. Render it inside AlertDialogContent: the dialog unmounts it on close, so
// every opening starts without an error from the last attempt.
export function DeleteUserConfirm({ user, onDeleted }: DeleteUserConfirmProps) {
  const queryClient = useQueryClient();
  const deleteUser = useMutation({
    mutationFn: async () => {
      await api.delete(`/users/${user.id}`);
    },
    onSuccess: async () => {
      // Their tickets are unassigned and they leave the assignee pickers.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
        queryClient.invalidateQueries({ queryKey: ["assignees"] }),
      ]);
      onDeleted();
    },
  });

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete user?</AlertDialogTitle>
        <AlertDialogDescription>
          {user.name} ({user.email}) will be signed out and can no longer sign in. Their tickets will be unassigned.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {deleteUser.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{apiErrorMessage(deleteUser.error)}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={deleteUser.isPending} onClick={() => deleteUser.mutate()}>
          {deleteUser.isPending ? "Deleting…" : "Delete"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
