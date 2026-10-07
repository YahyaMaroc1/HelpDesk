import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";

// Shape of GET /api/users (server/src/routes/users.ts).
type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "AGENT";
  createdAt: string;
};

export function UsersPage() {
  const { data: users, error, isPending } = useQuery({
    queryKey: ["users"],
    queryFn: async ({ signal }) => (await api.get<{ users: User[] }>("/users", { signal })).data.users,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">Admins and agents who can sign in to HelpDesk.</p>
      </div>

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
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                    {user.role === "ADMIN" ? "Admin" : "Agent"}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
