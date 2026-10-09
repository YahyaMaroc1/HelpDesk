import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { UserForm, type EditableUser } from "@/components/UserForm.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
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

export function UsersPage() {
  const { data: users, error, isPending } = useQuery({
    queryKey: ["users"],
    queryFn: async ({ signal }) => (await api.get<{ users: User[] }>("/users", { signal })).data.users,
  });
  // One dialog for creating (user: null) and editing. Closing keeps `user`, so the form doesn't switch to
  // "New user" while the dialog animates out.
  const [dialog, setDialog] = useState<{ open: boolean; user: EditableUser | null }>({ open: false, user: null });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Admins and agents who can sign in to HelpDesk.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, user: null })}>
          <PlusIcon />
          New user
        </Button>
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <UserForm user={dialog.user} onSaved={() => setDialog((d) => ({ ...d, open: false }))} />
        </DialogContent>
      </Dialog>

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
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${user.name}`}
                    onClick={() => setDialog({ open: true, user })}
                  >
                    <PencilIcon />
                  </Button>
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
                <Skeleton className="ml-auto size-7" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
