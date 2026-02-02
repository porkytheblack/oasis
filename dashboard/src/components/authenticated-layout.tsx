"use client";

import * as React from "react";
import { AuthGuard } from "./auth-guard";
import { Sidebar } from "./sidebar";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

/**
 * Authenticated layout component.
 * Wraps content with AuthGuard and shows Sidebar when authenticated.
 */
export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 ml-64">{children}</div>
      </div>
    </AuthGuard>
  );
}
