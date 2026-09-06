"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userMessage";
import { adminAiMediaService } from "@/api";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { AdminListLayout } from "@/components/admin/list";
import { Sparkles as StudioIcon } from "@/components/admin/LocalIcons";
import { formatRelativeDate } from "../mediaUtils";
import { cn } from "@/lib/utils";

const STUDIO_ASPECT = "3:4";
const STUDIO_QUALITY = "high";
const STUDIO_N = 1;

const MAX_REFS = 8;
const MAX_BYTES = 25 * 1024 * 1024;

function jobId(job) {
  return job?._id || job?.id || "";
}

function jobImages(job) {
  const urls = [];
  for (const url of job?.outputUrls || []) {
    if (url && !urls.includes(url)) urls.push(url);
  }
  if (job?.outputUrl && !urls.includes(job.outputUrl)) urls.unshift(job.outputUrl);
  return urls;
}

function isActiveJob(job) {
  return job?.status === "pending" || job?.status === "processing";
}

function SortableRefTile({ item, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={cn("relative shrink-0", isDragging && "opacity-80")}
    >
      <div
        {...attributes}
        {...listeners}
        className="h-14 w-14 cursor-grab overflow-hidden rounded-xl border border-[#e5e5e5] active:cursor-grabbing"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.preview} alt="" className="h-full w-full object-cover" />
      </div>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(item.id)}
        className="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white shadow-sm hover:bg-[#1a1a1a]"
        aria-label="Remove reference"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function AiStudioPage() {
  const userInfo = useAdminAuthStore((s) => s.userInfo);
  const authed = Boolean(
    userInfo?.authenticated || userInfo?.token || userInfo?._id
  );

  const [status, setStatus] = useState({ enabled: false, model: "" });
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const inputRef = useRef(null);
  const promptRef = useRef(null);
  const previewsRef = useRef([]);
  const refId = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const loadJobs = useCallback(async () => {
    const data = await adminAiMediaService.listJobs();
    setJobs(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [st] = await Promise.all([
          adminAiMediaService.status(),
          loadJobs(),
        ]);
        if (!cancelled) setStatus(st || { enabled: false });
      } catch (err) {
        toast.error(userErrorMessage(err, "Couldn’t load AI Studio"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, loadJobs]);

  const hasActive = useMemo(() => jobs.some(isActiveJob), [jobs]);

  useEffect(() => {
    if (!authed || !hasActive) return undefined;
    const timer = window.setInterval(() => {
      loadJobs().catch(() => {});
    }, 2500);
    return () => window.clearInterval(timer);
  }, [authed, hasActive, loadJobs]);

  useEffect(
    () => () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url);
    },
    []
  );

  const addReferences = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) =>
      String(f.type || "").startsWith("image/")
    );
    if (!incoming.length) {
      toast.error("Images only");
      return;
    }
    const tooBig = incoming.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 25 MB`);
      return;
    }
    setReferences((prev) => {
      const room = MAX_REFS - prev.length;
      if (room <= 0) {
        toast.error(`Up to ${MAX_REFS} reference images`);
        return prev;
      }
      const nextFiles = incoming.slice(0, room).map((file) => {
        const preview = URL.createObjectURL(file);
        previewsRef.current.push(preview);
        refId.current += 1;
        return { id: `ref-${refId.current}`, file, preview };
      });
      return [...prev, ...nextFiles];
    });
  };

  const removeReference = (id) => {
    setReferences((prev) => {
      const item = prev.find((r) => r.id === id);
      if (item?.preview) {
        URL.revokeObjectURL(item.preview);
        previewsRef.current = previewsRef.current.filter(
          (url) => url !== item.preview
        );
      }
      return prev.filter((r) => r.id !== id);
    });
  };

  const reorderReferences = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setReferences((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const generate = async () => {
    const text = prompt.trim();
    if (!text || generating) return;
    if (!status.enabled) {
      toast.error("Set OPENROUTER_API_KEY to enable generation");
      return;
    }
    setGenerating(true);
    try {
      const job = await adminAiMediaService.generateImage({
        prompt: text,
        aspectRatio: STUDIO_ASPECT,
        quality: STUDIO_QUALITY,
        n: STUDIO_N,
        references: references.map((r) => r.file),
      });
      setJobs((prev) => [job, ...prev.filter((j) => jobId(j) !== jobId(job))]);
    } catch (err) {
      toast.error(userErrorMessage(err, "Couldn’t start generation"));
    } finally {
      setGenerating(false);
    }
  };

  const deleteJob = async (job) => {
    const id = jobId(job);
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      await adminAiMediaService.deleteJob(id);
      setJobs((prev) => prev.filter((j) => jobId(j) !== id));
    } catch (err) {
      toast.error(userErrorMessage(err, "Couldn’t delete image"));
    } finally {
      setDeletingId("");
    }
  };

  const canGenerate = Boolean(prompt.trim()) && status.enabled && !generating;
  const hasRefs = references.length > 0;

  return (
    <AdminListLayout fill={false} title="AI Studio" icon={StudioIcon}>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            addReferences(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="min-w-0 pb-36">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-[#616161]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading generations…
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-[13px] text-[#616161]">No generations yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {jobs.map((job) => {
                const id = jobId(job);
                const images = jobImages(job);
                const active = isActiveJob(job);
                return (
                  <div
                    key={id}
                    className="overflow-hidden rounded-xl border border-[#e3e3e3] bg-white"
                  >
                    <div
                      className="relative bg-[#f7f7f7]"
                      style={{ aspectRatio: "3 / 4" }}
                    >
                      {images[0] ? (
                        <a href={images[0]} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={images[0]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#616161]">
                          {active ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : null}
                          <span className="text-[12px] font-[550]">
                            {job.status === "failed"
                              ? "Failed"
                              : job.status === "processing"
                                ? "Generating…"
                                : "Queued"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[13px] font-[550] text-[#303030]">
                          {job.prompt || "Untitled"}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[#8a8a8a]">
                          {formatRelativeDate(job.createdAt)}
                        </p>
                        {job.status === "failed" && job.error ? (
                          <p className="mt-1 line-clamp-2 text-[12px] text-[#b3261e]">
                            {job.error}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteJob(job)}
                        disabled={deletingId === id}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#616161] hover:bg-[#f1f1f1] hover:text-[#303030]"
                        aria-label="Delete generation"
                      >
                        {deletingId === id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 md:left-[var(--sidebar-width)] md:px-4 md:pb-3">
          <div
            className={cn(
              "pointer-events-auto flex w-full max-w-3xl flex-col rounded-[0.75rem] border border-[#e5e5e5] bg-white text-[#303030] shadow-[0_12px_40px_rgba(0,0,0,0.14)]",
              hasRefs ? "p-3" : "p-2.5"
            )}
          >
            {hasRefs ? (
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={reorderReferences}
                >
                  <SortableContext
                    items={references.map((r) => r.id)}
                    strategy={rectSortingStrategy}
                  >
                    {references.map((item) => (
                      <SortableRefTile
                        key={item.id}
                        item={item}
                        onRemove={removeReference}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {references.length < MAX_REFS ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#d6d6d6] bg-white text-[#616161] hover:bg-[#f7f7f7]"
                    aria-label="Add reference image"
                  >
                    <Plus className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              {!hasRefs ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] border border-[#d6d6d6] bg-white text-[#303030] hover:bg-[#f7f7f7]"
                  aria-label="Add reference image"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.75} />
                </button>
              ) : null}
              <input
                ref={promptRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    generate();
                  }
                }}
                placeholder="Describe the scene you imagine"
                maxLength={4000}
                className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-[#303030] outline-none placeholder:text-[#8a8a8a]"
              />
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[0.75rem] bg-black px-5 text-[14px] font-[650] text-white transition-opacity hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminListLayout>
  );
}
