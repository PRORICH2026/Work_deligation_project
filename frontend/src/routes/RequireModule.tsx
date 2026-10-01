import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { canAccessPath } from "./access";
import { useCurrentUser } from "./RequireSession";

export default function RequireModule({ path, children }: { path: string; children: ReactNode }) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/" replace />;
  if (!canAccessPath(user.role, path)) return <Navigate to="/tasks" replace />;
  return children;
}
