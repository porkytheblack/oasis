"use client";

import * as React from "react";
import {
  ToastProvider as RadixToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastIcon,
} from "@/components/ui/toast";
import type { Toast as ToastType, ToastType as ToastVariant } from "@/lib/types";

interface ToastContextValue {
  toasts: ToastType[];
  addToast: (toast: Omit<ToastType, "id">) => void;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(
  undefined
);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastType[]>([]);

  const addToast = React.useCallback((toast: Omit<ToastType, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastType = {
      ...toast,
      id,
      duration: toast.duration || 5000,
    };
    setToasts((prev) => [...prev, newToast]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const createToastFn = React.useCallback(
    (type: ToastVariant) =>
      (title: string, description?: string) => {
        addToast({ type, title, description });
      },
    [addToast]
  );

  const success = React.useMemo(
    () => createToastFn("success"),
    [createToastFn]
  );
  const error = React.useMemo(() => createToastFn("error"), [createToastFn]);
  const warning = React.useMemo(
    () => createToastFn("warning"),
    [createToastFn]
  );
  const info = React.useMemo(() => createToastFn("info"), [createToastFn]);

  const value = React.useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      success,
      error,
      warning,
      info,
    }),
    [toasts, addToast, removeToast, success, error, warning, info]
  );

  return (
    <ToastContext.Provider value={value}>
      <RadixToastProvider swipeDirection="right">
        {children}

        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.type}
            duration={toast.duration}
            onOpenChange={(open) => {
              if (!open) removeToast(toast.id);
            }}
          >
            <div className="flex gap-3">
              <ToastIcon variant={toast.type} />
              <div className="flex-1">
                <ToastTitle>{toast.title}</ToastTitle>
                {toast.description && (
                  <ToastDescription>{toast.description}</ToastDescription>
                )}
              </div>
            </div>
            <ToastClose />
          </Toast>
        ))}

        <ToastViewport />
      </RadixToastProvider>
    </ToastContext.Provider>
  );
}
