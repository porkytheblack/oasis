"use client";

import * as React from "react";
import {
  setApiKey,
  clearApiKey,
  getStoredApiKey,
  validateApiKeyFormat,
  verifyApiKey,
  setApiUrl,
  getApiUrl,
} from "./api";

/**
 * Authentication state interface.
 */
interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  apiKey: string | null;
  apiUrl: string;
}

/**
 * Authentication context value interface.
 */
interface AuthContextValue extends AuthState {
  login: (apiKey: string, apiUrl?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateApiUrl: (url: string) => void;
}

/**
 * Default context value before initialization.
 */
const defaultContextValue: AuthContextValue = {
  isAuthenticated: false,
  isLoading: true,
  apiKey: null,
  apiUrl: "http://localhost:9090",
  login: async () => ({ success: false, error: "Context not initialized" }),
  logout: () => {},
  updateApiUrl: () => {},
};

/**
 * Authentication context for managing API key authentication.
 */
const AuthContext = React.createContext<AuthContextValue>(defaultContextValue);

/**
 * Hook to access authentication context.
 * Throws if used outside of AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Props for the AuthProvider component.
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication provider component.
 * Manages authentication state and provides login/logout functionality.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = React.useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    apiKey: null,
    apiUrl: "http://localhost:9090",
  });

  /**
   * Initialize authentication state from localStorage on mount.
   */
  React.useEffect(() => {
    const initializeAuth = async () => {
      const storedKey = getStoredApiKey();
      const storedUrl = getApiUrl();

      if (storedKey) {
        // Verify the stored key is still valid
        const isValid = await verifyApiKey();
        if (isValid) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            apiKey: storedKey,
            apiUrl: storedUrl,
          });
          return;
        }
        // Key is invalid, clear it
        clearApiKey();
      }

      setState({
        isAuthenticated: false,
        isLoading: false,
        apiKey: null,
        apiUrl: storedUrl,
      });
    };

    initializeAuth();
  }, []);

  /**
   * Login with an API key.
   * Validates the key format and verifies it with the server.
   */
  const login = React.useCallback(
    async (apiKey: string, apiUrl?: string): Promise<{ success: boolean; error?: string }> => {
      // Validate API key format
      if (!validateApiKeyFormat(apiKey)) {
        return {
          success: false,
          error: "Invalid API key format. Keys must start with 'uk_live_'",
        };
      }

      // Update API URL if provided
      if (apiUrl) {
        setApiUrl(apiUrl);
      }

      // Store the key temporarily for verification
      setApiKey(apiKey);

      // Verify the key with the server
      const isValid = await verifyApiKey();
      if (!isValid) {
        clearApiKey();
        return {
          success: false,
          error: "Invalid API key. Please check your key and try again.",
        };
      }

      // Update state on successful login
      setState({
        isAuthenticated: true,
        isLoading: false,
        apiKey,
        apiUrl: apiUrl || state.apiUrl,
      });

      return { success: true };
    },
    [state.apiUrl]
  );

  /**
   * Logout and clear authentication state.
   */
  const logout = React.useCallback(() => {
    clearApiKey();
    setState((prev) => ({
      ...prev,
      isAuthenticated: false,
      apiKey: null,
    }));
  }, []);

  /**
   * Update the API URL.
   */
  const updateApiUrl = React.useCallback((url: string) => {
    setApiUrl(url);
    setState((prev) => ({
      ...prev,
      apiUrl: url,
    }));
  }, []);

  const contextValue = React.useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      updateApiUrl,
    }),
    [state, login, logout, updateApiUrl]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
