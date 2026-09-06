import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FolderOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { Conversation, Project } from "@/types";

export default function Projects() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<Project[]>("/projects"),
    enabled: Boolean(user),
  });

  const chats = useQuery({
    queryKey: ["project-conversations", openId],
    queryFn: () => apiGet<Conversation[]>(`/projects/${openId}/conversations`),
    enabled: Boolean(openId),
  });

  const create = useMutation({
    mutationFn: () => apiPost<Project>("/projects", { name, description }),
    onSuccess: (p) => {
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Project “${p.name}” created`);
    },
    onError: () => toast.error("Could not create the project"),
  });

  const saveInstructions = useMutation({
    mutationFn: (id: string) => apiPatch<Project>(`/projects/${id}`, { instructions }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project instructions saved");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${id}`),
    onSuccess: () => {
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted — its chats were kept");
    },
  });

  const field =
    "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#d5cfc4]";

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          data-testid="back-to-chat-link"
          className="mb-6 inline-flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to chat
        </Link>

        <h1 className="font-heading text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          A project keeps related chats together and applies its own instructions to every chat
          inside it.
        </p>

        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 className="text-[13px] font-semibold">New project</h2>
          <div className="mt-3 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              data-testid="project-name-input"
              className={field}
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about? (optional)"
              data-testid="project-description-input"
              className={field}
            />
            <button
              onClick={() => name.trim() && create.mutate()}
              disabled={!name.trim() || create.isPending}
              data-testid="create-project-button"
              className="flex items-center gap-1.5 rounded-lg bg-clay px-4 py-2 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#a34c29] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Create project
            </button>
          </div>
        </section>

        <div className="mt-4 space-y-3" data-testid="project-list">
          {(projects.data ?? []).map((p) => (
            <section
              key={p.id}
              data-testid="project-item"
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-[15px] font-medium">
                    <FolderOpen className="h-4 w-4 text-clay" />
                    {p.name}
                  </h3>
                  {p.description && (
                    <p className="mt-1 text-[13px] text-muted-foreground">{p.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to={`/?project=${p.id}`}
                    data-testid="project-open-chat-link"
                    className="rounded-lg border border-border px-3 py-1.5 text-[12px] transition-colors duration-200 hover:bg-secondary"
                  >
                    Chat in project
                  </Link>
                  <button
                    onClick={() => {
                      setOpenId(openId === p.id ? null : p.id);
                      setInstructions(p.instructions);
                    }}
                    data-testid="project-toggle-button"
                    className="rounded-lg border border-border px-3 py-1.5 text-[12px] transition-colors duration-200 hover:bg-secondary"
                  >
                    {openId === p.id ? "Close" : "Configure"}
                  </button>
                  <button
                    onClick={() => remove.mutate(p.id)}
                    data-testid="project-delete-button"
                    aria-label={`Delete ${p.name}`}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors duration-200 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {openId === p.id && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <label className="block text-[12px] font-medium">Project instructions</label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={4}
                    placeholder="e.g. Always answer as a senior TypeScript reviewer and prefer small diffs."
                    data-testid="project-instructions-input"
                    className={`${field} resize-none`}
                  />
                  <button
                    onClick={() => saveInstructions.mutate(p.id)}
                    data-testid="save-project-instructions-button"
                    className="rounded-lg bg-clay px-4 py-2 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#a34c29]"
                  >
                    Save instructions
                  </button>

                  <div className="pt-2">
                    <p className="text-[12px] font-medium">Chats in this project</p>
                    <ul className="mt-2 space-y-1" data-testid="project-chat-list">
                      {(chats.data ?? []).map((c) => (
                        <li key={c.id} className="text-[13px] text-muted-foreground">
                          {c.title}
                        </li>
                      ))}
                      {(chats.data ?? []).length === 0 && (
                        <li className="text-[12.5px] text-muted-foreground">
                          No chats yet — use “Chat in project”.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          ))}
          {(projects.data ?? []).length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
              No projects yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
