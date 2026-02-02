"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApps, createApp, getErrorMessage } from "@/lib/api";
import type { CreateAppRequest } from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  Input,
  Textarea,
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
import { Plus, Box, ArrowRight, Package } from "lucide-react";
import { slugify } from "@/lib/utils";

function AppsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(
    searchParams.get("create") === "true"
  );
  const [formData, setFormData] = React.useState<CreateAppRequest>({
    name: "",
    slug: "",
    description: "",
  });
  const [autoSlug, setAutoSlug] = React.useState(true);

  const { data: apps = [], isLoading, error } = useQuery({
    queryKey: ["apps"],
    queryFn: getApps,
  });

  const createMutation = useMutation({
    mutationFn: createApp,
    onSuccess: (newApp) => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success("App created", `${newApp.name} has been created successfully.`);
      setIsCreateModalOpen(false);
      setFormData({ name: "", slug: "", description: "" });
      setAutoSlug(true);
      router.push(`/apps/${newApp.id}`);
    },
    onError: (err) => {
      toast.error("Failed to create app", getErrorMessage(err));
    },
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: autoSlug ? slugify(name) : prev.slug,
    }));
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAutoSlug(false);
    setFormData((prev) => ({
      ...prev,
      slug: slugify(e.target.value),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast.error("Validation error", "Name and slug are required.");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setFormData({ name: "", slug: "", description: "" });
    setAutoSlug(true);
    // Remove the create query param
    if (searchParams.get("create")) {
      router.replace("/apps");
    }
  };

  if (isLoading) {
    return (
      <Page title="Applications" description="Manage your Tauri applications">
        <PageSpinner />
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Applications" description="Manage your Tauri applications">
        <Card>
          <CardContent className="p-6">
            <p className="text-[hsl(var(--destructive))]">
              Failed to load applications: {getErrorMessage(error)}
            </p>
          </CardContent>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Applications"
      description="Manage your Tauri applications"
      actions={
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New App
        </Button>
      }
    >
      {apps.length === 0 ? (
        <EmptyState
          icon={Box}
          title="No applications yet"
          description="Create your first application to start managing releases and updates."
          action={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create App
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <Link key={app.id} href={`/apps/${app.id}`}>
              <Card
                interactive
                className="group h-full transition-all duration-200 hover:shadow-lg"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))]">
                      <Box className="h-6 w-6 text-white" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-[hsl(var(--foreground-muted))] transition-transform group-hover:translate-x-1" />
                  </div>

                  <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-1">
                    {app.name}
                  </h3>
                  <p className="text-sm font-mono text-[hsl(var(--foreground-muted))] mb-3">
                    {app.slug}
                  </p>

                  {app.description && (
                    <p className="text-sm text-[hsl(var(--foreground-muted))] mb-4 line-clamp-2">
                      {app.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 pt-4 border-t border-[hsl(var(--border))]">
                    <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--foreground-muted))]">
                      <Package className="h-4 w-4" />
                      <span>
                        {app.releaseCount || 0} release
                        {app.releaseCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {app.latestVersion && (
                      <div className="text-sm text-[hsl(var(--foreground-muted))]">
                        Latest: v{app.latestVersion}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create App Modal */}
      <Modal open={isCreateModalOpen} onOpenChange={handleCloseModal}>
        <ModalContent>
          <form onSubmit={handleSubmit}>
            <ModalHeader>
              <ModalTitle>Create New Application</ModalTitle>
              <ModalDescription>
                Add a new Tauri application to manage releases and updates.
              </ModalDescription>
            </ModalHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" required>
                  Application Name
                </Label>
                <Input
                  id="name"
                  placeholder="My Awesome App"
                  value={formData.name}
                  onChange={handleNameChange}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" required>
                  Slug
                </Label>
                <Input
                  id="slug"
                  placeholder="my-awesome-app"
                  value={formData.slug}
                  onChange={handleSlugChange}
                  className="font-mono"
                />
                <p className="text-xs text-[hsl(var(--foreground-muted))]">
                  Used in update URLs. Only lowercase letters, numbers, and
                  hyphens.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="A brief description of your application..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
            </div>

            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createMutation.isPending}
                disabled={!formData.name.trim() || !formData.slug.trim()}
              >
                Create App
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Page>
  );
}

export default function AppsPage() {
  return (
    <Suspense
      fallback={
        <Page title="Applications" description="Manage your Tauri applications">
          <PageSpinner />
        </Page>
      }
    >
      <AppsPageContent />
    </Suspense>
  );
}
