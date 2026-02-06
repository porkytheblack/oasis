"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApp,
  getPublicApiKeys,
  createPublicApiKey,
  revokePublicApiKey,
  getErrorMessage,
} from "@/lib/api";
import type { PublicApiKey, CreatePublicApiKeyRequest } from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Input,
  Label,
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
import { AppNav } from "@/components/app-nav";
import {
  Key,
  Plus,
  Copy,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";

export default function SDKKeysPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appId = params.appId as string;

  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = React.useState(false);
  const [keyToRevoke, setKeyToRevoke] = React.useState<PublicApiKey | null>(null);
  const [newKeyValue, setNewKeyValue] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<CreatePublicApiKeyRequest>({
    name: "",
  });

  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getApp(appId),
  });

  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["public-keys", appId],
    queryFn: () => getPublicApiKeys(appId),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreatePublicApiKeyRequest) => createPublicApiKey(appId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["public-keys", appId] });
      setNewKeyValue(response.key);
      setFormData({ name: "" });
      toast.success("API key created", "Copy the key now - it won't be shown again.");
    },
    onError: (err) => {
      toast.error("Failed to create API key", getErrorMessage(err));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokePublicApiKey(appId, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-keys", appId] });
      setIsRevokeModalOpen(false);
      setKeyToRevoke(null);
      toast.success("API key revoked", "The key has been revoked and can no longer be used.");
    },
    onError: (err) => {
      toast.error("Failed to revoke API key", getErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Validation error", "Name is required.");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleCopyKey = async () => {
    if (newKeyValue) {
      await navigator.clipboard.writeText(newKeyValue);
      toast.success("Copied", "API key copied to clipboard.");
    }
  };

  const handleCloseNewKeyModal = () => {
    setIsCreateModalOpen(false);
    setNewKeyValue(null);
  };

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  if (appLoading) {
    return (
      <Page title="Loading...">
        <PageSpinner />
      </Page>
    );
  }

  if (appError || !app) {
    return (
      <Page
        title="Application Not Found"
        breadcrumbs={[{ label: "Apps", href: "/apps" }, { label: "Not Found" }]}
      >
        <Card>
          <CardContent className="p-6">
            <p className="text-[hsl(var(--destructive))]">
              {appError ? getErrorMessage(appError) : "Application not found."}
            </p>
          </CardContent>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="SDK Keys"
      description={`Public API keys for ${app.name} SDK integration`}
      currentAppId={appId}
      breadcrumbs={[
        { label: "Apps", href: "/apps" },
        { label: app.name, href: `/apps/${appId}` },
        { label: "SDK Keys" },
      ]}
      actions={
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New SDK Key
        </Button>
      }
    >
      {/* App Navigation */}
      <AppNav appId={appId} />

      {/* Info Card */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[hsl(var(--primary))]/10 shrink-0">
              <Key className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <h3 className="font-medium text-[hsl(var(--foreground))]">About SDK Keys</h3>
              <p className="text-sm text-[hsl(var(--foreground-muted))] mt-1">
                SDK keys (prefixed with <code className="font-mono bg-[hsl(var(--muted))] px-1 rounded">pk_</code>) are used by the @oasis/sdk package to submit feedback and crash reports from your application.
                These keys are safe to include in your application code as they only allow submitting data, not reading it.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Keys */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-[hsl(var(--primary))]" />
            Active Keys
          </CardTitle>
          <CardDescription>
            Keys that can be used for SDK authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keysLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
            </div>
          ) : activeKeys.length === 0 ? (
            <EmptyState
              icon={Key}
              title="No SDK keys yet"
              description="Create an SDK key to start collecting feedback and crash reports."
              action={
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create SDK Key
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {activeKeys.map((key) => (
                <KeyRow
                  key={key.id}
                  apiKey={key}
                  onRevoke={() => {
                    setKeyToRevoke(key);
                    setIsRevokeModalOpen(true);
                  }}
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
            <CardTitle className="flex items-center gap-2 text-[hsl(var(--foreground-muted))]">
              <Key className="h-5 w-5" />
              Revoked Keys
            </CardTitle>
            <CardDescription>
              Keys that have been revoked and can no longer be used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {revokedKeys.map((key) => (
                <KeyRow key={key.id} apiKey={key} isRevoked />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Key Modal */}
      <Modal open={isCreateModalOpen} onOpenChange={handleCloseNewKeyModal}>
        <ModalContent>
          {newKeyValue ? (
            <>
              <ModalHeader>
                <ModalTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  API Key Created
                </ModalTitle>
                <ModalDescription>
                  Copy your API key now. For security reasons, it will only be shown once.
                </ModalDescription>
              </ModalHeader>

              <div className="py-4">
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-[hsl(var(--muted))] p-3 rounded-lg break-all">
                    {newKeyValue}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopyKey}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-[hsl(var(--foreground-muted))] mt-2">
                  Use this key when initializing the @oasis/sdk in your application.
                </p>
              </div>

              <ModalFooter>
                <Button onClick={handleCloseNewKeyModal}>
                  Done
                </Button>
              </ModalFooter>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <ModalHeader>
                <ModalTitle>Create SDK Key</ModalTitle>
                <ModalDescription>
                  Create a new public API key for your application's SDK integration.
                </ModalDescription>
              </ModalHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name" required>
                    Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g., Production, Development"
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
              </div>

              <ModalFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
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
          )}
        </ModalContent>
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal open={isRevokeModalOpen} onOpenChange={setIsRevokeModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Revoke API Key
            </ModalTitle>
            <ModalDescription>
              Are you sure you want to revoke "{keyToRevoke?.name}"? This action cannot be undone.
              Any application using this key will no longer be able to submit feedback or crash reports.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setIsRevokeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => keyToRevoke && revokeMutation.mutate(keyToRevoke.id)}
              loading={revokeMutation.isPending}
            >
              Revoke Key
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Page>
  );
}

interface KeyRowProps {
  apiKey: PublicApiKey;
  onRevoke?: () => void;
  isRevoked?: boolean;
}

function KeyRow({ apiKey, onRevoke, isRevoked }: KeyRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--border))]",
        isRevoked && "opacity-60"
      )}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={cn(
          "p-2 rounded-lg",
          isRevoked ? "bg-gray-500/10" : "bg-emerald-500/10"
        )}>
          <Key className={cn(
            "h-5 w-5",
            isRevoked ? "text-gray-500" : "text-emerald-500"
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-[hsl(var(--foreground))]">
              {apiKey.name}
            </span>
            {isRevoked ? (
              <Badge className="border-red-500/30 bg-red-500/15 text-red-300">
                Revoked
              </Badge>
            ) : (
              <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                Active
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-[hsl(var(--foreground-muted))]">
            <code className="font-mono bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
              {apiKey.keyPrefix}...
            </code>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Created {formatRelativeTime(apiKey.createdAt)}
            </span>
            {apiKey.lastUsedAt && (
              <span className="flex items-center gap-1">
                Last used {formatRelativeTime(apiKey.lastUsedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {!isRevoked && onRevoke && (
        <div className="ml-4">
          <Button variant="ghost" size="sm" onClick={onRevoke}>
            <Trash2 className="h-4 w-4 text-[hsl(var(--destructive))]" />
          </Button>
        </div>
      )}
    </div>
  );
}
