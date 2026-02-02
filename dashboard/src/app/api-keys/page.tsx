"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApiKeys,
  getApps,
  createApiKey,
  revokeApiKey,
  getErrorMessage,
} from "@/lib/api";
import type { CreateApiKeyRequest, ApiKey, ApiKeyScope, App } from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Badge,
  EmptyState,
  PageSpinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import {
  Plus,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  Clock,
  Shield,
  Bot,
  Box,
} from "lucide-react";
import { formatRelativeTime, copyToClipboard, cn } from "@/lib/utils";

/**
 * Scope configuration with display info.
 */
const SCOPE_CONFIG: Record<ApiKeyScope, { label: string; description: string; icon: React.ElementType; color: string }> = {
  admin: {
    label: "Admin",
    description: "Full administrative access to all resources",
    icon: Shield,
    color: "scope-admin",
  },
  ci: {
    label: "CI/CD",
    description: "Limited access for continuous integration pipelines",
    icon: Bot,
    color: "scope-ci",
  },
};

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = React.useState(false);
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<CreateApiKeyRequest>({
    name: "",
    scope: "ci",
    appId: undefined,
  });

  const { data: apiKeys = [], isLoading, error } = useQuery({
    queryKey: ["api-keys"],
    queryFn: getApiKeys,
  });

  const { data: apps = [] } = useQuery({
    queryKey: ["apps"],
    queryFn: getApps,
  });

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewKey(response.key);
      setIsCreateModalOpen(false);
      setIsKeyModalOpen(true);
      setFormData({ name: "", scope: "ci", appId: undefined });
    },
    onError: (err) => {
      toast.error("Failed to create API key", getErrorMessage(err));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked", "The key can no longer be used.");
    },
    onError: (err) => {
      toast.error("Failed to revoke key", getErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Validation error", "Name is required.");
      return;
    }
    createMutation.mutate({
      name: formData.name,
      scope: formData.scope,
      appId: formData.scope === "ci" ? formData.appId : undefined,
    });
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setFormData({ name: "", scope: "ci", appId: undefined });
  };

  const activeKeys = apiKeys.filter((key) => !key.revokedAt);
  const revokedKeys = apiKeys.filter((key) => key.revokedAt);

  if (isLoading) {
    return (
      <Page title="API Keys" description="Manage authentication for your applications">
        <PageSpinner />
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="API Keys" description="Manage authentication for your applications">
        <Card>
          <CardContent className="p-6">
            <p className="text-[hsl(var(--destructive))]">
              Failed to load API keys: {getErrorMessage(error)}
            </p>
          </CardContent>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="API Keys"
      description="Manage authentication for your applications"
      actions={
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New API Key
        </Button>
      }
    >
      {apiKeys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No API keys yet"
          description="Create an API key to authenticate your Tauri applications with the update server."
          action={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Active Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-500" />
                Active Keys ({activeKeys.length})
              </CardTitle>
              <CardDescription>
                These keys can be used to authenticate with the API
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeKeys.length === 0 ? (
                <p className="text-sm text-[hsl(var(--foreground-muted))] py-4 text-center">
                  No active API keys
                </p>
              ) : (
                <div className="space-y-3">
                  {activeKeys.map((key) => (
                    <ApiKeyRow
                      key={key.id}
                      apiKey={key}
                      apps={apps}
                      onRevoke={() => revokeMutation.mutate(key.id)}
                      isRevoking={revokeMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revoked Keys */}
          {revokedKeys.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-[hsl(var(--foreground-muted))]" />
                  Revoked Keys ({revokedKeys.length})
                </CardTitle>
                <CardDescription>
                  These keys are no longer valid
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {revokedKeys.map((key) => (
                    <ApiKeyRow key={key.id} apiKey={key} apps={apps} revoked />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create API Key Modal */}
      <Modal open={isCreateModalOpen} onOpenChange={handleCloseCreateModal}>
        <ModalContent className="max-w-lg">
          <form onSubmit={handleSubmit}>
            <ModalHeader>
              <ModalTitle>Create New API Key</ModalTitle>
              <ModalDescription>
                Create a key to authenticate with the update server API.
              </ModalDescription>
            </ModalHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" required>
                  Key Name
                </Label>
                <Input
                  id="name"
                  placeholder="Production Deploy Key"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  autoFocus
                />
                <p className="text-xs text-[hsl(var(--foreground-muted))]">
                  A descriptive name to identify this key.
                </p>
              </div>

              <div className="space-y-2">
                <Label required>Scope</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(SCOPE_CONFIG) as ApiKeyScope[]).map((scope) => {
                    const config = SCOPE_CONFIG[scope];
                    const Icon = config.icon;
                    const isSelected = formData.scope === scope;

                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, scope, appId: undefined }))}
                        className={cn(
                          "relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all cursor-pointer",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2",
                          isSelected
                            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 shadow-sm"
                            : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--muted))]/50"
                        )}
                      >
                        {/* Selection indicator */}
                        <div
                          className={cn(
                            "absolute top-3 right-3 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                            isSelected
                              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]"
                              : "border-[hsl(var(--border))]"
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              isSelected
                                ? "bg-[hsl(var(--primary))]/20"
                                : "bg-[hsl(var(--muted))]"
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-5 w-5",
                                isSelected
                                  ? "text-[hsl(var(--primary))]"
                                  : "text-[hsl(var(--foreground-muted))]"
                              )}
                            />
                          </div>
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              isSelected
                                ? "text-[hsl(var(--primary))]"
                                : "text-[hsl(var(--foreground))]"
                            )}
                          >
                            {config.label}
                          </span>
                        </div>
                        <span className="text-xs text-[hsl(var(--foreground-muted))] pr-6">
                          {config.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* App Selection for CI scope */}
              {formData.scope === "ci" && apps.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="appId">Restrict to Application (optional)</Label>
                  <select
                    id="appId"
                    value={formData.appId || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        appId: e.target.value || undefined,
                      }))
                    }
                    className={cn(
                      "w-full h-10 rounded-md px-3 cursor-pointer",
                      "bg-[hsl(var(--input))] border border-[hsl(var(--border))]",
                      "text-sm text-[hsl(var(--foreground))]",
                      "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    )}
                  >
                    <option value="">All Applications</option>
                    {apps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name} ({app.slug})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[hsl(var(--foreground-muted))]">
                    Optionally limit this key to a specific application.
                  </p>
                </div>
              )}
            </div>

            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseCreateModal}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createMutation.isPending}
                disabled={!formData.name.trim()}
              >
                Create Key
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* New Key Display Modal */}
      <Modal open={isKeyModalOpen} onOpenChange={setIsKeyModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Save Your API Key
            </ModalTitle>
            <ModalDescription>
              This is the only time you will see this key. Make sure to copy it now.
            </ModalDescription>
          </ModalHeader>

          <div className="py-4">
            <div className="p-4 rounded-lg bg-[hsl(var(--muted))] border border-[hsl(var(--border))]">
              <code className="text-sm font-mono text-[hsl(var(--foreground))] break-all">
                {newKey}
              </code>
            </div>
          </div>

          <ModalFooter>
            <CopyButton text={newKey || ""} onCopied={() => setIsKeyModalOpen(false)} />
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Page>
  );
}

interface ApiKeyRowProps {
  apiKey: ApiKey;
  apps: App[];
  revoked?: boolean;
  onRevoke?: () => void;
  isRevoking?: boolean;
}

function ApiKeyRow({ apiKey, apps, revoked, onRevoke, isRevoking }: ApiKeyRowProps) {
  const app = apiKey.appId ? apps.find((a) => a.id === apiKey.appId) : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--border))]",
        revoked && "opacity-60"
      )}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            revoked ? "bg-[hsl(var(--muted))]" : "bg-[hsl(var(--primary))]/10"
          )}
        >
          <Key
            className={cn(
              "h-5 w-5",
              revoked ? "text-[hsl(var(--foreground-muted))]" : "text-[hsl(var(--primary))]"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-medium text-[hsl(var(--foreground))]">
              {apiKey.name}
            </p>
            {revoked && (
              <Badge variant="destructive" className="text-xs">
                Revoked
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-[hsl(var(--foreground-muted))] flex-wrap">
            <span className="font-mono">{apiKey.keyPrefix}...</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {revoked && apiKey.revokedAt
                ? `Revoked ${formatRelativeTime(apiKey.revokedAt)}`
                : `Created ${formatRelativeTime(apiKey.createdAt)}`}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <ScopeBadge scope={apiKey.scope} />
            {app && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Box className="h-3 w-3" />
                {app.name}
              </Badge>
            )}
            {apiKey.lastUsedAt && (
              <span className="text-xs text-[hsl(var(--foreground-muted))]">
                Last used {formatRelativeTime(apiKey.lastUsedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {!revoked && onRevoke && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          disabled={isRevoking}
          className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface ScopeBadgeProps {
  scope: ApiKeyScope;
}

function ScopeBadge({ scope }: ScopeBadgeProps) {
  const config = SCOPE_CONFIG[scope];
  const Icon = config?.icon || Key;

  return (
    <Badge variant="outline" className={cn("text-xs flex items-center gap-1", config?.color)}>
      <Icon className="h-3 w-3" />
      {config?.label || scope}
    </Badge>
  );
}

interface CopyButtonProps {
  text: string;
  onCopied?: () => void;
}

function CopyButton({ text, onCopied }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const toast = useToast();

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      toast.success("Copied", "API key copied to clipboard.");
      setTimeout(() => {
        setCopied(false);
        onCopied?.();
      }, 1500);
    } else {
      toast.error("Copy failed", "Please copy the key manually.");
    }
  };

  return (
    <Button onClick={handleCopy} className="w-full">
      {copied ? (
        <>
          <Check className="h-4 w-4 mr-2" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-4 w-4 mr-2" />
          Copy to Clipboard
        </>
      )}
    </Button>
  );
}
