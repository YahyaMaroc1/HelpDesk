import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { DeleteUserConfirm } from "@/components/DeleteUserConfirm.tsx";
import { UserForm, type EditableUser } from "@/components/UserForm.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import { Role } from "@/lib/role.ts";

// Shape of GET /api/users (server/src/routes/users.ts).
type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
};

// What the page's dialog is for.
type UserAction = { kind: "create" } | { kind: "edit"; user: EditableUser } | { kind: "delete"; user: EditableUser };

export function UsersPage() {
  const { data: users, error, isPending } = useQuery({
    queryKey: ["users"],
    queryFn: async ({ signal }) => (await api.get<{ users: User[] }>("/users", { signal })).data.users,
  });
  // Which dialog is showing: the user form (create/edit) or the delete confirmation. Closing only clears `open`
  // and keeps `action`, so the dialog's content doesn't change while it animates out.
  const [dialog, setDialog] = useState<{ open: boolean; action: UserAction }>({
    open: false,
    action: { kind: "create" },
  });
  const { action } = dialog;
  const setOpen = (open: boolean) => setDialog((d) => ({ ...d, open }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Admins and agents who can sign in to HelpDesk.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, action: { kind: "create" } })}>
          <PlusIcon />
          New user
        </Button>
      </div>

      <Dialog open={dialog.open && action.kind !== "delete"} onOpenChange={setOpen}>
        <DialogContent>
          {action.kind !== "delete" && (
            <UserForm user={action.kind === "edit" ? action.user : null} onSaved={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog.open && action.kind === "delete"} onOpenChange={setOpen}>
        <AlertDialogContent>
          {action.kind === "delete" && <DeleteUserConfirm user={action.user} onDeleted={() => setOpen(false)} />}
        </AlertDialogContent>
      </AlertDialog>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>Couldn't load users: {apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <UsersTableSkeleton />}

      {users && (
        <Table>
          <UsersTableHeader />
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.role === Role.ADMIN ? "default" : "secondary"}>
                    {user.role === Role.ADMIN ? "Admin" : "Agent"}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  {/* Left-aligned so the edit buttons line up whether or not a row has a delete button. */}
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${user.name}`}
                      onClick={() => setDialog({ open: true, action: { kind: "edit", user } })}
                    >
                      <PencilIcon />
                    </Button>
                    {/* Admins can't be deleted (the API refuses too). */}
                    {user.role !== Role.ADMIN && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${user.name}`}
                        onClick={() => setDialog({ open: true, action: { kind: "delete", user } })}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function UsersTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Email</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Created</TableHead>
        <TableHead className="w-0">
          <span className="sr-only">Actions</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

// Placeholder rows shaped like the real ones. Hidden from assistive tech, which gets the status text instead.
function UsersTableSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading users…</span>
      <Table aria-hidden="true">
        <UsersTableHeader />
        <TableBody>
          {Array.from({ length: 5 }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Skeleton className="size-7" />
                  <Skeleton className="size-7" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
