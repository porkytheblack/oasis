"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth-context";
import { validateApiKeyFormat, getApiUrl } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Box, Key, AlertCircle, Server, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Login page component.
 * Provides a form for users to enter their API key and connect to the server.
 * Styled with hex.tech-inspired design language.
 */
export function LoginPage() {
  const { login, apiUrl, updateApiUrl } = useAuth();

  const [apiKey, setApiKey] = React.useState("");
  const [customUrl, setCustomUrl] = React.useState(apiUrl);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [formatError, setFormatError] = React.useState<string | null>(null);

  // Sync custom URL with context URL
  React.useEffect(() => {
    setCustomUrl(getApiUrl());
  }, []);

  /**
   * Validate API key format on change.
   */
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setApiKey(value);
    setError(null);

    if (value && !validateApiKeyFormat(value)) {
      setFormatError("API key must start with 'uk_live_'");
    } else {
      setFormatError(null);
    }
  };

  /**
   * Handle form submission.
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    if (!validateApiKeyFormat(apiKey)) {
      setError("Invalid API key format. Keys must start with 'uk_live_'");
      return;
    }

    setIsLoading(true);

    try {
      // Update API URL if changed
      if (customUrl !== apiUrl) {
        updateApiUrl(customUrl);
      }

      const result = await login(apiKey, customUrl);
      if (!result.success) {
        setError(result.error || "Authentication failed");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = apiKey.trim() && validateApiKeyFormat(apiKey);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] p-4">
      {/* Background gradient effect - hex.tech style */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-[hsl(var(--primary))]/5 to-transparent" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-[hsl(var(--accent))]/5 to-transparent" />
      </div>

      <div className="relative w-full max-w-md z-10">
        {/* Logo and Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] mb-5 shadow-xl shadow-[hsl(var(--accent))]/20">
            <Box className="h-10 w-10 text-white" />
            {/* Inner glow */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent" />
          </div>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
            Oasis Dashboard
          </h1>
          <p className="text-[hsl(var(--foreground-muted))] text-sm mt-2">
            Tauri Update Server Administration
          </p>
        </div>

        {/* Login Card */}
        <Card variant="glass" className="backdrop-blur-xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2.5 text-xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/20">
                <Key className="h-4 w-4 text-[hsl(var(--accent))]" />
              </div>
              Sign In
            </CardTitle>
            <CardDescription>
              Enter your API key to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error Alert */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-[hsl(var(--destructive))]/10 border border-[hsl(var(--destructive))]/20">
                  <AlertCircle className="h-5 w-5 text-[hsl(var(--destructive))] shrink-0 mt-0.5" />
                  <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
                </div>
              )}

              {/* API Key Input */}
              <div className="space-y-2">
                <Label htmlFor="api-key" required>
                  API Key
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="uk_live_..."
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  error={formatError || undefined}
                  autoFocus
                  autoComplete="off"
                  className="font-mono"
                />
                <p className="text-xs text-[hsl(var(--foreground-muted))]">
                  Your API key can be found in the server configuration or generated via CLI.
                </p>
              </div>

              {/* Advanced Settings Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer group"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[hsl(var(--muted))] group-hover:bg-[hsl(var(--border))] transition-colors">
                  {showAdvanced ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
                Advanced Settings
              </button>

              {/* Advanced Settings */}
              {showAdvanced && (
                <div className="space-y-3 p-4 rounded-lg bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))]">
                  <Label htmlFor="api-url" className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                    Server URL
                  </Label>
                  <Input
                    id="api-url"
                    type="url"
                    placeholder="http://localhost:9090"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-[hsl(var(--foreground-muted))]">
                    The URL of your Oasis update server
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                variant="gradient"
                className="w-full h-11"
                loading={isLoading}
                disabled={!isValid}
              >
                <Key className="h-4 w-4" />
                Connect to Server
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-[hsl(var(--foreground-muted))] mt-8">
          Need an API key?{" "}
          <a
            href="https://github.com/your-org/oasis"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[hsl(var(--accent))] hover:text-[hsl(var(--highlight))] transition-colors cursor-pointer"
          >
            View documentation
          </a>
        </p>
      </div>
    </div>
  );
}
