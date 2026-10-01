export const moduleRoutes = [
  { path: "/tasks", label: "Task Management", roles: null },
  { path: "/management/delegations", label: "All Delegations", roles: ["ADMIN", "HR", "EA", "MD"] },
  { path: "/employee-management", label: "Employee Management", roles: ["ADMIN", "HR", "EA"] },
  { path: "/performance", label: "Performance", roles: ["MD"] },
  { path: "/new-delegation", label: "+ New Delegation", roles: null },
] as const;

export function canAccessPath(role: string | null, path: string) {
  if (!role) return false;
  const route = moduleRoutes.find((item) => item.path === path);
  if (!route) return false;
  return route.roles === null || (route.roles as readonly string[]).includes(role);
}
