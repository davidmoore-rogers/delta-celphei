import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasRole, useMe } from "../lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children ?? <Outlet />}</>;
}

export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { data } = useMe();
  if (!data) return null;
  if (!hasRole(data.user.roles, ...roles)) {
    return (
      <div className="p-8 text-center text-ink-2">
        You don&apos;t have permission to view this page.
      </div>
    );
  }
  return <>{children}</>;
}

function FullPageSpinner() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-edge border-t-brand animate-spin" />
    </div>
  );
}
