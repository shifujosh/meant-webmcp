const E2E_WORKSPACE_PREFIX = "e2e-";

export type E2EFault = "persistence" | "postcondition";

export function isDisposableE2EWorkspace(workspaceId: unknown): workspaceId is string {
  return typeof workspaceId === "string" && workspaceId.startsWith(E2E_WORKSPACE_PREFIX) && /^[a-zA-Z0-9-]{12,96}$/.test(workspaceId);
}

export function requestedE2EFault(request: Request, workspaceId: unknown): E2EFault | null {
  if (process.env.NODE_ENV !== "development" || !isDisposableE2EWorkspace(workspaceId)) return null;
  const fault = request.headers.get("x-meant-e2e-fault");
  return fault === "persistence" || fault === "postcondition" ? fault : null;
}
