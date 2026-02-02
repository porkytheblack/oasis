"use client";

import { Page } from "@/components/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Button,
} from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { getDefaultApiUrlRuntime } from "@/lib/config";
import { Settings as SettingsIcon, Server, Save } from "lucide-react";
import * as React from "react";

export default function SettingsPage() {
  const toast = useToast();
  const defaultApiUrl = getDefaultApiUrlRuntime();
  const [apiUrl, setApiUrl] = React.useState(
    typeof window !== "undefined"
      ? localStorage.getItem("oasis_api_url") || defaultApiUrl
      : defaultApiUrl
  );

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("oasis_api_url", apiUrl);
      toast.success("Settings saved", "API URL has been updated. Refresh to apply changes.");
    }
  };

  return (
    <Page
      title="Settings"
      description="Configure your dashboard settings"
      breadcrumbs={[{ label: "Settings" }]}
    >
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-[hsl(var(--primary))]" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Configure the connection to your Oasis Update Server
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiUrl">API Server URL</Label>
              <Input
                id="apiUrl"
                placeholder={defaultApiUrl}
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-[hsl(var(--foreground-muted))]">
                The URL of your Oasis API server. Changes take effect after refresh.
              </p>
            </div>

            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-[hsl(var(--primary))]" />
              About
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--foreground-muted))]">Dashboard Version</span>
                <span className="font-mono text-[hsl(var(--foreground))]">0.1.0</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[hsl(var(--border))]">
                <span className="text-[hsl(var(--foreground-muted))]">Framework</span>
                <span className="font-mono text-[hsl(var(--foreground))]">Next.js 16</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-[hsl(var(--foreground-muted))]">Designed for</span>
                <span className="font-mono text-[hsl(var(--foreground))]">Tauri Update Server</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
