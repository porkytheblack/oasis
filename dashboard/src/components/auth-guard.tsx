"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth-context";
import { LoginPage } from "./login-page";
import { Spinner } from "./ui/spinner";

/**
 * Props for AuthGuard component.
 */
interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Authentication guard component.
 * Shows a login page when user is not authenticated,
 * or renders children when authenticated.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking authentication status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-[hsl(var(--foreground-muted))] text-sm">
            Verifying authentication...
          </p>
        </div>
      </div>
    );
  }

  // Show login page when not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Render children when authenticated
  return <>{children}</>;
}
