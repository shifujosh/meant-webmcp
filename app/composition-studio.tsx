"use client";

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Columns2,
  History,
  Layers3,
  Mic,
  PanelLeft,
  Plus,
  RotateCcw,
  Volume2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { seedProject } from "@/lib/ghosa/seed";
import type { CommittedChange, StudioProject } from "@/lib/ghosa/contracts";
import {
  compositionOperationDigest,
  createCompositionDraft,
  createCompositionFromBrief,
  createCompositionOperation,
  createSeedComposition,
  extendCompositionDraft,
  groundCompositionOperationInputs,
  planCompositionTurn,
  summarizeCompositionDirection,
  type CompositionDocument,
  type CompositionDraft,
  type CompositionFrame,
  type CompositionKind,
  type CompositionNode,
  type CompositionOperation,
} from "@/lib/meant/composition-core";
import {
  createCompositionWebMcpTools,
  registerCompositionWebMcpTools,
  type CompositionCommandSurface,
  type CompositionWebMcpTool,
} from "@/lib/meant/composition-webmcp";
import { reanchorCompositionSelection } from "@/lib/meant/composition-selection";
import { compactCompositionContext, compactPreviewResult } from "@/lib/meant/composition-agent-output";
import { releaseRealtimeResources } from "@/lib/meant/realtime-lifecycle";

type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking" | "error";
type SaveState = "loading" | "saved" | "saving" | "local" | "conflict";
type WebMcpStatus = "checking" | "ready" | "unavailable";

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`;
const VOICE_SESSION_MAXIMUM_MS = 8 * 60 * 1_000;

export function createCompositionCommandSurface(handlers: CompositionCommandSurface) {
  return handlers;
}

function nodeStyle(node: CompositionNode): React.CSSProperties {
  const style = node.style;
  return {
    left: `${style.x}%`,
    top: `${style.y}%`,
    width: `${style.width}%`,
    height: `${style.height}%`,
    zIndex: style.zIndex,
    color: style.color,
    background: style.backgroundColor,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    borderStyle: style.borderWidth ? "solid" : undefined,
    borderRadius: style.borderRadius,
    fontFamily: style.fontFamily === "serif" ? "var(--font-serif)" : style.fontFamily === "mono" ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: `${style.fontSize / 16}cqw`,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: `${style.letterSpacing}em`,
    textAlign: style.textAlign,
    opacity: style.opacity,
    transform: `rotate(${style.rotation}deg)`,
  };
}

function FrameCanvas({ frame, selectedNodeIds, onSelect, compact = false, width = 1600, height = 1000 }: {
  frame: CompositionFrame;
  selectedNodeIds: string[];
  onSelect?: (nodeId: string) => void;
  compact?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <div className={`composition-frame ${compact ? "is-compact" : ""}`} style={{ aspectRatio: `${width} / ${height}`, background: frame.background }} data-frame-id={frame.id}>
      {!compact ? <><span aria-hidden="true" className="aperture-corner aperture-top-left" /><span aria-hidden="true" className="aperture-corner aperture-bottom-right" /></> : null}
      {frame.nodes.filter((node) => !node.hidden).map((node) => compact ? (
        <div className={`composition-node type-${node.type}`} data-node-id={node.id} key={node.id} style={nodeStyle(node)}>
          {node.type === "text" ? <span>{node.content}</span> : null}
        </div>
      ) : (
        <button
          aria-label={`Select ${node.name}`}
          className={`composition-node type-${node.type} ${selectedNodeIds.includes(node.id) ? "is-selected" : ""}`}
          data-node-id={node.id}
          data-node-name={node.name}
          disabled={!onSelect || node.locked}
          key={node.id}
          onClick={(event) => { event.stopPropagation(); onSelect?.(node.id); }}
          style={nodeStyle(node)}
          type="button"
        >
          {node.type === "text" ? <span>{node.content}</span> : null}
          {selectedNodeIds.includes(node.id) ? <><i aria-hidden="true" className="selection-corner selection-top-left" /><i aria-hidden="true" className="selection-corner selection-bottom-right" /></> : null}
        </button>
      ))}
    </div>
  );
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function CompositionStudio() {
  const [project, setProject] = useState<StudioProject>(() => structuredClone(seedProject));
  const [composition, setComposition] = useState<CompositionDocument>(() => createSeedComposition());
  const [revision, setRevision] = useState(0);
  const [workspaceId, setWorkspaceId] = useState("");
  const [history, setHistory] = useState<CommittedChange[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState<CompositionDraft | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState("frame-opening");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(["opening-title"]);
  const [transcript, setTranscript] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const [agentCaption, setAgentCaption] = useState("Tell me what you want to make or change.");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [compareMode, setCompareMode] = useState(false);
  const [mobileCompareView, setMobileCompareView] = useState<"kept" | "exploring">("exploring");
  const [boardOpen, setBoardOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>("checking");
  const [hydrationReady, setHydrationReady] = useState(false);
  const [sharedPersistenceReady, setSharedPersistenceReady] = useState(false);
  const [newComposerOpen, setNewComposerOpen] = useState(false);
  const [newKind, setNewKind] = useState<CompositionKind>("deck");
  const [newBrief, setNewBrief] = useState("");
  const [e2eToolInput, setE2eToolInput] = useState("");
  const [e2eLastToolCall, setE2eLastToolCall] = useState<Record<string, unknown> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceSessionTimeoutRef = useRef<number | null>(null);
  const commandsRef = useRef<CompositionCommandSurface | null>(null);
  const compositionRef = useRef(composition);
  const draftRef = useRef(draft);
  const revisionRef = useRef(revision);
  const projectRef = useRef(project);
  const historyRef = useRef(history);
  const historyHasMoreRef = useRef(historyHasMore);
  const selectedFrameRef = useRef(selectedFrameId);
  const selectedNodesRef = useRef(selectedNodeIds);
  const workspaceRef = useRef(workspaceId);
  const saveStateRef = useRef(saveState);
  const hydrationReadyRef = useRef(hydrationReady);
  const voiceAttemptRef = useRef(0);
  const e2eToolsRef = useRef(new Map<string, CompositionWebMcpTool>());
  const e2eMode = process.env.NODE_ENV !== "production" && workspaceId.startsWith("e2e-");

  useEffect(() => { compositionRef.current = composition; }, [composition]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { revisionRef.current = revision; }, [revision]);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyHasMoreRef.current = historyHasMore; }, [historyHasMore]);
  useEffect(() => { selectedFrameRef.current = selectedFrameId; }, [selectedFrameId]);
  useEffect(() => { selectedNodesRef.current = selectedNodeIds; }, [selectedNodeIds]);
  useEffect(() => { workspaceRef.current = workspaceId; }, [workspaceId]);
  useEffect(() => { saveStateRef.current = saveState; }, [saveState]);
  useEffect(() => { hydrationReadyRef.current = hydrationReady; }, [hydrationReady]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 860px)");
    const initialSync = window.setTimeout(() => { if (mobile.matches) setBoardOpen(false); }, 0);
    const handleChange = (event: MediaQueryListEvent) => setBoardOpen(!event.matches);
    mobile.addEventListener("change", handleChange);
    return () => { window.clearTimeout(initialSync); mobile.removeEventListener("change", handleChange); };
  }, []);

  const anchorSelection = useCallback((document: CompositionDocument, frameId = selectedFrameRef.current, nodeIds = selectedNodesRef.current) => {
    const next = reanchorCompositionSelection(document, frameId, nodeIds);
    selectedFrameRef.current = next.frameId;
    selectedNodesRef.current = next.nodeIds;
    setSelectedFrameId(next.frameId);
    setSelectedNodeIds(next.nodeIds);
    return next;
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    selectedNodesRef.current = [nodeId];
    setSelectedNodeIds([nodeId]);
  }, []);

  const selectFrame = useCallback((frame: CompositionFrame) => {
    const nodeIds = [frame.nodes.find((node) => node.role === "title")?.id ?? frame.nodes[0]?.id].filter(Boolean) as string[];
    selectedFrameRef.current = frame.id;
    selectedNodesRef.current = nodeIds;
    setSelectedFrameId(frame.id);
    setSelectedNodeIds(nodeIds);
  }, []);

  const hydrateProject = useCallback((nextProject: StudioProject, nextRevision: number, nextHistory: CommittedChange[] = [], nextHistoryHasMore = false) => {
    const nextComposition = nextProject.composition ?? createSeedComposition();
    projectRef.current = nextProject;
    compositionRef.current = nextComposition;
    revisionRef.current = nextRevision;
    historyRef.current = nextHistory;
    historyHasMoreRef.current = nextHistoryHasMore;
    draftRef.current = null;
    setProject(nextProject);
    setComposition(nextComposition);
    setRevision(nextRevision);
    setHistory(nextHistory);
    setHistoryHasMore(nextHistoryHasMore);
    setDraft(null);
    setSaveState("saved");
    saveStateRef.current = "saved";
    setHydrationReady(true);
    setSharedPersistenceReady(true);
    anchorSelection(nextComposition);
  }, [anchorSelection]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stored = window.localStorage.getItem("meant-composition-workspace-v1");
    const requestedWorkspace = params.get("workspaceId");
    const isolatedE2E = process.env.NODE_ENV !== "production" && params.get("e2e") === "1" && Boolean(requestedWorkspace?.startsWith("e2e-")) && /^[a-zA-Z0-9-]{12,96}$/.test(requestedWorkspace ?? "");
    const storedWorkspace = stored && /^[a-zA-Z0-9-]{12,96}$/.test(stored) ? stored : null;
    const nextWorkspace = isolatedE2E ? requestedWorkspace! : storedWorkspace ?? createId("workspace");
    if (!isolatedE2E) window.localStorage.setItem("meant-composition-workspace-v1", nextWorkspace);
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      workspaceRef.current = nextWorkspace;
      setWorkspaceId(nextWorkspace);
      try {
        const session = await fetch("/api/session", { method: "POST", cache: "no-store" });
        if (!session.ok) {
          const sessionBody = await session.json().catch(() => ({})) as { error?: string };
          throw new Error(sessionBody.error ?? "A durable browser session could not be established");
        }
        const response = await fetch(`/api/project?workspaceId=${encodeURIComponent(nextWorkspace)}`, { cache: "no-store" });
        const body = await response.json() as { project?: StudioProject | null; revision?: number; history?: CommittedChange[]; historyHasMore?: boolean; error?: string };
        if (response.status === 401) setAuthRequired(true);
        else if (response.ok) setAuthRequired(false);
        if (!response.ok) throw new Error(body.error ?? "Workspace could not be loaded");
        if (body.project) {
          if (!cancelled) hydrateProject(body.project, body.revision ?? 1, body.history ?? [], body.historyHasMore ?? false);
          return;
        }
        const fresh = structuredClone(seedProject);
        const freshComposition = createSeedComposition();
        freshComposition.id = `composition-${nextWorkspace}`.slice(0, 120);
        fresh.composition = freshComposition;
        const bootstrap = await fetch(`/api/project?workspaceId=${encodeURIComponent(nextWorkspace)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project: fresh, expectedRevision: 0 }),
        });
        const result = await bootstrap.json() as { revision?: number; error?: string };
        if (!bootstrap.ok && bootstrap.status !== 409) throw new Error(result.error ?? "Workspace could not be created");
        if (bootstrap.status === 409) {
          const authoritative = await fetch(`/api/project?workspaceId=${encodeURIComponent(nextWorkspace)}`, { cache: "no-store" });
          const authoritativeBody = await authoritative.json() as { project?: StudioProject | null; revision?: number; history?: CommittedChange[]; historyHasMore?: boolean; error?: string };
          if (!authoritative.ok || !authoritativeBody.project) throw new Error(authoritativeBody.error ?? "Authoritative workspace could not be loaded");
          if (!cancelled) hydrateProject(authoritativeBody.project, authoritativeBody.revision ?? 1, authoritativeBody.history ?? [], authoritativeBody.historyHasMore ?? false);
          return;
        }
        if (!cancelled) hydrateProject(fresh, result.revision ?? 1, []);
      } catch (error) {
        if (cancelled) return;
        setHydrationReady(true);
        setSharedPersistenceReady(false);
        setSaveState("local");
        saveStateRef.current = "local";
        setNotice(error instanceof Error ? `${error.message}. Preview remains available in this tab; durable Keep and reload persistence are unavailable.` : "Preview remains available in this tab; durable Keep and reload persistence are unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, [hydrateProject]);

  const previewOperations = useCallback((summary: string, operations: CompositionOperation[], sourceTurnId = createId("turn"), refine = true) => {
    if (!hydrationReadyRef.current) {
      const error = "Meant is still opening the authoritative workspace. Try that direction again in a moment.";
      setAgentCaption(error);
      return { ok: false, error, committed: false };
    }
    if (saveStateRef.current !== "saved" && saveStateRef.current !== "local") {
      const error = saveStateRef.current === "saving"
        ? "Meant is confirming the current decision. Wait for its history receipt before shaping another direction."
        : "Resolve the authoritative workspace state before shaping another direction.";
      setAgentCaption(error);
      return { ok: false, error, committed: false };
    }
    const currentDraft = draftRef.current;
    let next: CompositionDraft;
    try {
      next = refine && currentDraft
        ? extendCompositionDraft(compositionRef.current, currentDraft, sourceTurnId, summary, operations)
        : createCompositionDraft(compositionRef.current, sourceTurnId, summary, operations);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That direction could not be previewed safely.";
      if (currentDraft && /visible change/i.test(message)) {
        draftRef.current = null;
        setDraft(null);
        setCompareMode(false);
        anchorSelection(compositionRef.current);
        setAgentCaption("This now matches the kept version exactly, so there is no Exploring draft to Keep.");
        setNotice("");
        return { ok: true, committed: false, revertedToKept: true };
      }
      setAgentCaption(message);
      setNotice(message);
      return { ok: false, error: message, committed: false };
    }
    draftRef.current = next;
    setDraft(next);
    setCompareMode(false);
    setMobileCompareView("exploring");
    setAgentCaption(`${summary}. I kept the current version underneath so you can compare or discard this direction.`);
    setNotice("");
    return compactPreviewResult(next);
  }, [anchorSelection]);

  const previewTurn = useCallback((input: { transcript: string; summary?: string }) => {
    const operations = planCompositionTurn(draftRef.current?.preview ?? compositionRef.current, {
      transcript: input.transcript,
      selectedFrameId: selectedFrameRef.current,
      selectedNodeIds: selectedNodesRef.current,
    });
    if (!operations.length) {
      const message = "I need a little more direction. Try a change to the selected text, hierarchy, alignment, color, or frame mood.";
      setAgentCaption(message);
      return { ok: false, clarification: message };
    }
    return previewOperations(summarizeCompositionDirection(input.summary ?? input.transcript), operations);
  }, [previewOperations]);

  const createNewComposition = useCallback((input: { kind: CompositionKind; brief: string; title?: string }) => {
    if (!hydrationReadyRef.current || (saveStateRef.current !== "saved" && saveStateRef.current !== "local")) {
      const error = "Wait for the authoritative workspace before starting another composition.";
      setAgentCaption(error);
      return { ok: false, error };
    }
    if (draftRef.current) {
      const error = "Keep or discard the active Exploring draft before starting a new composition.";
      setAgentCaption(error);
      return { ok: false, error };
    }
    const operation = createCompositionFromBrief(compositionRef.current, input);
    const firstFrame = operation.document.frames[0]!;
    selectedFrameRef.current = firstFrame.id;
    selectedNodesRef.current = [firstFrame.nodes.find((node) => node.role === "title")?.id ?? firstFrame.nodes[0]?.id].filter(Boolean) as string[];
    setSelectedFrameId(firstFrame.id);
    setSelectedNodeIds(selectedNodesRef.current);
    setBoardOpen(input.kind === "deck");
    setNewComposerOpen(false);
    setNewBrief("");
    return previewOperations(`Create a new ${input.kind}: ${operation.document.title}`, [operation], createId("new"), false);
  }, [previewOperations]);

  const readAuthoritativeProject = useCallback(async () => {
    if (!workspaceId) return;
    const response = await fetch(`/api/project?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const body = await response.json() as { project?: StudioProject; revision?: number; history?: CommittedChange[]; historyHasMore?: boolean; error?: string };
    if (response.status === 401) setAuthRequired(true);
    else if (response.ok) setAuthRequired(false);
    if (!response.ok || !body.project) throw new Error(body.error ?? "The authoritative workspace could not be read");
    return { project: body.project, revision: body.revision ?? revisionRef.current, history: body.history ?? [], historyHasMore: body.historyHasMore ?? false };
  }, [workspaceId]);

  const refetch = useCallback(async (preserveDraft = false) => {
    const body = await readAuthoritativeProject();
    if (!body) return;
    if (preserveDraft) {
      projectRef.current = body.project;
      compositionRef.current = body.project.composition ?? createSeedComposition();
      revisionRef.current = body.revision;
      historyRef.current = body.history;
      historyHasMoreRef.current = body.historyHasMore;
      setProject(body.project);
      setComposition(compositionRef.current);
      setRevision(revisionRef.current);
      setHistory(historyRef.current);
      setHistoryHasMore(body.historyHasMore);
      setSaveState("conflict");
      saveStateRef.current = "conflict";
    } else {
      hydrateProject(body.project, body.revision, body.history, body.historyHasMore);
    }
  }, [hydrateProject, readAuthoritativeProject]);

  const loadEarlierHistory = useCallback(async () => {
    const beforeRevision = historyRef.current.at(-1)?.revision;
    if (!workspaceId || !historyHasMoreRef.current || !beforeRevision || historyLoading) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/project?workspaceId=${encodeURIComponent(workspaceId)}&historyBeforeRevision=${beforeRevision}`, { cache: "no-store" });
      const body = await response.json() as { history?: CommittedChange[]; historyHasMore?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Earlier revisions could not be loaded");
      const known = new Set(historyRef.current.map((item) => item.id));
      const merged = [...historyRef.current, ...(body.history ?? []).filter((item) => !known.has(item.id))];
      historyRef.current = merged;
      historyHasMoreRef.current = body.historyHasMore ?? false;
      setHistory(merged);
      setHistoryHasMore(historyHasMoreRef.current);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Earlier revisions could not be loaded");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading, workspaceId]);

  const keepDraft = useCallback(async (draftId: string) => {
    const active = draftRef.current;
    if (!active || active.id !== draftId) return { ok: false, error: "That exploring draft is no longer active." };
    if (!workspaceRef.current || !sharedPersistenceReady || saveStateRef.current !== "saved") {
      return { ok: false, error: "Shared persistence must be ready before Keep." };
    }
    const expectedRevision = revisionRef.current;
    setSaveState("saving");
    saveStateRef.current = "saving";
    let expectedDigest = "";
    try {
      expectedDigest = await compositionOperationDigest(active.operations);
      const response = await fetch("/api/composition/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          projectId: projectRef.current.id,
          expectedRevision,
          draftId: active.id,
          sourceTurnId: active.sourceTurnId,
          summary: active.summary,
          operations: active.operations,
        }),
      });
      const body = await response.json() as { project?: StudioProject; newRevision?: number; committedChangeId?: string; committedChange?: CommittedChange; operationDigest?: string; error?: string; authoritativeRevision?: number };
      if (!response.ok || !body.project) {
        if (response.status === 409) {
          await refetch(true);
          setAgentCaption("Needs review. The kept work changed in another view. Compare before discarding or trying this direction again.");
          setNotice(body.error ?? "This direction is still Exploring.");
        } else if (response.status >= 500) {
          throw new Error(body.error ?? "The shared history response could not be confirmed.");
        } else {
          setSaveState("saved");
          saveStateRef.current = "saved";
          setAgentCaption("This direction is still Exploring. It was not kept.");
          setNotice(body.error ?? "The shared history could not confirm this revision.");
        }
        return { ok: false, error: body.error };
      }
      const nextComposition = body.project.composition;
      const nextRevision = body.newRevision;
      if (!nextComposition || !Number.isInteger(nextRevision) || nextRevision !== expectedRevision + 1 || !body.committedChange ||
          body.operationDigest !== expectedDigest || body.committedChange.operationDigest !== expectedDigest ||
          body.committedChange.kind !== "apply" || body.committedChange.parentRevision !== expectedRevision || body.committedChange.revision !== nextRevision) {
        throw new Error("Authoritative commit metadata was incomplete.");
      }
      const expandedHistory = [body.committedChange, ...historyRef.current.filter((item) => item.id !== body.committedChange!.id)];
      const nextHistory = expandedHistory.slice(0, 40);
      const nextHistoryHasMore = historyHasMoreRef.current || expandedHistory.length > nextHistory.length;
      projectRef.current = body.project;
      compositionRef.current = nextComposition;
      revisionRef.current = nextRevision;
      historyRef.current = nextHistory;
      historyHasMoreRef.current = nextHistoryHasMore;
      draftRef.current = null;
      setProject(body.project);
      setComposition(nextComposition);
      setRevision(nextRevision);
      setDraft(null);
      setCompareMode(false);
      setSaveState("saved");
      saveStateRef.current = "saved";
      setAgentCaption(`Kept. Revision ${nextRevision}.`);
      setHistory(nextHistory);
      setHistoryHasMore(nextHistoryHasMore);
      setNotice("");
      anchorSelection(nextComposition);
      return { ok: true, committedChangeId: body.committedChange.id, revision: nextRevision, operationDigest: body.operationDigest };
    } catch (error) {
      const transportMessage = error instanceof Error ? error.message : "The shared history response was interrupted.";
      if (!expectedDigest) {
        setSaveState("saved");
        saveStateRef.current = "saved";
        setAgentCaption("This direction is still Exploring. Its operation receipt could not be prepared, so no Keep request was sent.");
        setNotice(transportMessage);
        return { ok: false, error: transportMessage };
      }
      try {
        const authoritative = await readAuthoritativeProject();
        const committed = authoritative?.history.find((item) => item.kind === "apply" && item.id.startsWith("composition-commit-") && item.parentRevision === expectedRevision && item.operationDigest === expectedDigest);
        if (authoritative && committed) {
          hydrateProject(authoritative.project, authoritative.revision, authoritative.history, authoritative.historyHasMore);
          setAgentCaption(`Kept. Revision ${committed.revision}. The history receipt was recovered after the connection interruption.`);
          setNotice("");
          return { ok: true, committedChangeId: committed.id, revision: committed.revision, operationDigest: committed.operationDigest, reconciled: true };
        }
        if (authoritative && authoritative.revision !== expectedRevision) {
          projectRef.current = authoritative.project;
          compositionRef.current = authoritative.project.composition ?? createSeedComposition();
          revisionRef.current = authoritative.revision;
          historyRef.current = authoritative.history;
          historyHasMoreRef.current = authoritative.historyHasMore;
          setProject(authoritative.project);
          setComposition(compositionRef.current);
          setRevision(authoritative.revision);
          setHistory(authoritative.history);
          setHistoryHasMore(authoritative.historyHasMore);
          setSaveState("conflict");
          saveStateRef.current = "conflict";
          setAgentCaption("Needs review. The kept work changed while Keep was being confirmed; this direction remains visibly Exploring.");
          setNotice(transportMessage);
          return { ok: false, error: transportMessage };
        }
        setSaveState("saved");
        saveStateRef.current = "saved";
        setAgentCaption("This direction is still Exploring. The authoritative history confirms it was not kept.");
        setNotice(transportMessage);
        return { ok: false, error: transportMessage };
      } catch {
        setSaveState("conflict");
        saveStateRef.current = "conflict";
        setAgentCaption("Keep could not be confirmed. This direction remains visible, and editing is paused until authoritative history is reloaded.");
        setNotice(transportMessage);
        return { ok: false, error: transportMessage, reconciliationRequired: true };
      }
    }
  }, [anchorSelection, hydrateProject, readAuthoritativeProject, refetch, sharedPersistenceReady, workspaceId]);

  const discardDraft = useCallback((draftId: string) => {
    if (draftRef.current?.id !== draftId) return { ok: false, error: "Draft not found" };
    if (saveStateRef.current === "saving") return { ok: false, error: "Wait for the current history decision to finish before discarding." };
    draftRef.current = null;
    setDraft(null);
    setCompareMode(false);
    setMobileCompareView("exploring");
    anchorSelection(compositionRef.current);
    if (saveStateRef.current === "conflict") {
      setSaveState("saved");
      saveStateRef.current = "saved";
    }
    setAgentCaption("Discarded. The kept version is unchanged.");
    setNotice("");
    return { ok: true };
  }, [anchorSelection]);

  const undoChange = useCallback(async (committedChangeId: string, expectedRevision: number) => {
    if (draftRef.current) {
      const error = "Keep or discard the active Exploring draft before Undo.";
      setNotice(error);
      return { ok: false, error };
    }
    if (!workspaceRef.current || !sharedPersistenceReady || saveStateRef.current !== "saved") {
      return { ok: false, error: "Shared persistence must be ready before Undo." };
    }
    setSaveState("saving");
    saveStateRef.current = "saving";
    try {
      const response = await fetch("/api/transactions/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, projectId: projectRef.current.id, committedChangeId, expectedRevision, domain: "composition" }),
      });
      const body = await response.json() as { project?: StudioProject; newRevision?: number; error?: string; committedChangeId?: string; committedChange?: CommittedChange };
      if (!response.ok) {
        if (response.status >= 500) throw new Error(body.error ?? "The Undo response could not be confirmed.");
        const nextState = response.status === 409 ? "conflict" : "saved";
        setSaveState(nextState);
        saveStateRef.current = nextState;
        if (response.status === 409) await refetch();
        setNotice(body.error ?? "That change could not be undone.");
        return { ok: false, error: body.error };
      }
      if (!body.project || !body.committedChange || !Number.isInteger(body.newRevision) || body.newRevision !== expectedRevision + 1 ||
          body.committedChange.kind !== "revert" || body.committedChange.parentRevision !== expectedRevision ||
          body.committedChange.revision !== body.newRevision || body.committedChange.revertedChangeId !== committedChangeId ||
          body.committedChangeId !== body.committedChange.id) {
        throw new Error("Authoritative Undo metadata was incomplete.");
      }
      const expandedHistory = [body.committedChange, ...historyRef.current.filter((item) => item.id !== body.committedChange!.id)];
      const nextHistory = expandedHistory.slice(0, 40);
      hydrateProject(body.project, body.newRevision, nextHistory, historyHasMoreRef.current || expandedHistory.length > nextHistory.length);
      setAgentCaption(`Undone as revision ${body.newRevision}. The earlier content is restored, and both decisions remain in recent History.`);
      setNotice("");
      return { ok: true, committedChangeId: body.committedChangeId, revision: body.newRevision };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Undo persistence is unavailable.";
      try {
        const authoritative = await readAuthoritativeProject();
        if (!authoritative) throw new Error("The authoritative workspace could not be read");
        const revert = authoritative.history.find((item) => item.kind === "revert" && item.parentRevision === expectedRevision && item.revertedChangeId === committedChangeId);
        hydrateProject(authoritative.project, authoritative.revision, authoritative.history, authoritative.historyHasMore);
        if (revert) {
          setAgentCaption(`Undone as revision ${revert.revision}. The history receipt was recovered after the connection interruption.`);
          setNotice("");
          return { ok: true, committedChangeId: revert.id, revision: revert.revision, reconciled: true };
        }
        setAgentCaption("Authoritative history confirms that Undo did not create a revert revision.");
        setNotice(message);
        return { ok: false, error: message };
      } catch {
        setSaveState("conflict");
        saveStateRef.current = "conflict";
        setAgentCaption("Undo could not be confirmed. Editing is paused until authoritative history is reloaded.");
        setNotice(message);
        return { ok: false, error: message, reconciliationRequired: true };
      }
    }
  }, [hydrateProject, readAuthoritativeProject, refetch, sharedPersistenceReady, workspaceId]);

  const requestDraftDecision = useCallback((action: "keep" | "discard", draftId: string) => {
    const active = draftRef.current;
    if (!active || active.id !== draftId) return { ok: false, error: "That Exploring draft is no longer active." };
    if (saveStateRef.current === "saving") return { ok: false, error: "A history decision is already being confirmed." };
    if (action === "keep" && (!sharedPersistenceReady || saveStateRef.current !== "saved")) {
      return { ok: false, error: "Keep confirmation is available only when shared history is ready." };
    }
    const label = action === "keep" ? "Keep" : "Discard";
    setAgentCaption(`${label} is ready for your confirmation in Meant.`);
    setNotice(`The agent requested ${label}. Use the visible ${label} control to decide.`);
    return { ok: true, requiresHumanConfirmation: true, action, draftId };
  }, [sharedPersistenceReady]);

  const requestUndo = useCallback((committedChangeId: string, expectedRevision: number) => {
    if (draftRef.current) return { ok: false, error: "Keep or discard the active Exploring draft before Undo." };
    if (!sharedPersistenceReady || saveStateRef.current !== "saved") return { ok: false, error: "Undo confirmation is available only when shared history is ready." };
    const latest = historyRef.current.find((item) => item.kind === "apply" && item.id.startsWith("composition-commit-") && item.revision === revisionRef.current);
    if (!latest || latest.id !== committedChangeId || expectedRevision !== revisionRef.current) {
      return { ok: false, error: "Undo requires the exact latest kept change and current revision." };
    }
    setAgentCaption("Undo is ready for your confirmation in Meant.");
    setNotice("The agent requested Undo. Use the visible Undo control to create the revert revision.");
    return { ok: true, requiresHumanConfirmation: true, action: "undo", committedChangeId, expectedRevision };
  }, [sharedPersistenceReady]);

  const getCompositionContext = useCallback(() => {
    const activeDocument = draftRef.current?.preview ?? compositionRef.current;
    const selection = reanchorCompositionSelection(activeDocument, selectedFrameRef.current, selectedNodesRef.current);
    return compactCompositionContext({
      activeDocument,
      keptDocument: compositionRef.current,
      draft: draftRef.current,
      selectedFrameId: selection.frameId,
      selectedNodeIds: selection.nodeIds,
      revision: revisionRef.current,
      persistence: { hydrated: hydrationReady, durable: sharedPersistenceReady, state: saveStateRef.current },
      recentHistory: historyRef.current,
    });
  }, [hydrationReady, sharedPersistenceReady]);

  useEffect(() => {
    const commands = createCompositionCommandSurface({
      getContext: getCompositionContext,
      create: createNewComposition,
      previewTurn,
      preview: ({ summary, operations, sourceTurnId }) => {
        const source = draftRef.current?.preview ?? compositionRef.current;
        return previewOperations(summary, groundCompositionOperationInputs(source, operations), sourceTurnId);
      },
      keep: (draftId) => requestDraftDecision("keep", draftId),
      discard: (draftId) => requestDraftDecision("discard", draftId),
      undo: requestUndo,
    });
    commandsRef.current = commands;
    return () => { if (commandsRef.current === commands) commandsRef.current = null; };
  }, [createNewComposition, getCompositionContext, previewOperations, previewTurn, requestDraftDecision, requestUndo]);

  useEffect(() => {
    if (!hydrationReady) return;
    const e2eTools = e2eToolsRef.current;
    const injectedContext = e2eMode && !document.modelContext
      ? {
          registerTool: (tool: CompositionWebMcpTool, options?: { signal?: AbortSignal }) => {
            void tool;
            void options;
          },
        }
      : null;
    if (injectedContext) document.modelContext = injectedContext;
    const context = document.modelContext;
    if (!context || !sharedPersistenceReady || !workspaceId) {
      const unavailable = window.setTimeout(() => setWebMcpStatus("unavailable"), 0);
      return () => {
        window.clearTimeout(unavailable);
        if (injectedContext && document.modelContext === injectedContext) document.modelContext = undefined;
      };
    }
    const controller = new AbortController();
    const registrationContext = e2eMode
      ? {
          registerTool: (tool: CompositionWebMcpTool, options: { signal: AbortSignal }) => {
            if (options.signal.aborted) return;
            e2eTools.set(tool.name, tool);
            options.signal.addEventListener("abort", () => e2eTools.delete(tool.name), { once: true });
            return context.registerTool(tool, options);
          },
        }
      : context;
    const checking = window.setTimeout(() => setWebMcpStatus("checking"), 0);
    void registerCompositionWebMcpTools(registrationContext, () => {
      if (!commandsRef.current) throw new Error("Composition commands are not ready");
      return commandsRef.current;
    }, controller.signal).then(() => {
      window.clearTimeout(checking);
      if (!controller.signal.aborted) setWebMcpStatus("ready");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      window.clearTimeout(checking);
      controller.abort();
      setWebMcpStatus("unavailable");
      setNotice(error instanceof Error ? `Agent tools are unavailable: ${error.message}` : "Agent tools are unavailable in this browser.");
    });
    return () => {
      window.clearTimeout(checking);
      controller.abort();
      if (injectedContext && document.modelContext === injectedContext) document.modelContext = undefined;
      if (injectedContext) e2eTools.clear();
    };
  }, [e2eMode, hydrationReady, sharedPersistenceReady, workspaceId]);

  const executeE2EWebMcpTool = useCallback(async () => {
    let name = "unknown";
    try {
      const parsed = JSON.parse(e2eToolInput) as { name?: unknown; input?: unknown };
      if (typeof parsed.name !== "string" || !parsed.input || typeof parsed.input !== "object" || Array.isArray(parsed.input)) {
        throw new Error("A tool name and object input are required");
      }
      name = parsed.name;
      const tool = e2eToolsRef.current.get(name);
      if (!tool) throw new Error(`Registered tool not found: ${name}`);
      setE2eLastToolCall({ name, settled: false });
      const result = await tool.execute(parsed.input as Record<string, unknown>, { signal: new AbortController().signal });
      setE2eLastToolCall({ name, settled: true, result });
    } catch (error) {
      setE2eLastToolCall({ name, settled: true, error: error instanceof Error ? error.message : "Tool call failed" });
    }
  }, [e2eToolInput]);

  const stopVoice = useCallback(() => {
    voiceAttemptRef.current += 1;
    if (voiceSessionTimeoutRef.current !== null) {
      window.clearTimeout(voiceSessionTimeoutRef.current);
      voiceSessionTimeoutRef.current = null;
    }
    releaseRealtimeResources({
      channel: dataChannelRef.current,
      connection: pcRef.current,
      stream: microphoneRef.current,
      audio: audioRef.current,
    });
    dataChannelRef.current = null;
    pcRef.current = null;
    microphoneRef.current = null;
    audioRef.current = null;
    setVoiceState("idle");
    setLiveCaption("");
  }, []);

  const executeRealtimeTool = useCallback(async (name: string, argumentsText: string) => {
    const args = JSON.parse(argumentsText || "{}") as Record<string, unknown>;
    const tool = createCompositionWebMcpTools(() => {
      if (!commandsRef.current) throw new Error("Composition commands are not ready");
      return commandsRef.current;
    }).find((candidate) => candidate.name === name);
    if (!tool) return { ok: false, error: "Unknown composition tool" };
    return tool.execute(args);
  }, []);

  const startVoice = useCallback(async () => {
    if (voiceState === "error") stopVoice();
    else if (voiceState !== "idle") { stopVoice(); return; }
    if (!hydrationReadyRef.current || !workspaceRef.current) {
      setNotice("Meant is still opening the authoritative workspace. Live voice will be ready in a moment.");
      return;
    }
    const attempt = voiceAttemptRef.current + 1;
    voiceAttemptRef.current = attempt;
    setVoiceState("connecting");
    setNotice("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (voiceAttemptRef.current !== attempt) { stream.getTracks().forEach((track) => track.stop()); return; }
      microphoneRef.current = stream;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("aria-hidden", "true");
      document.body.appendChild(audio);
      audioRef.current = audio;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      pc.addTrack(stream.getAudioTracks()[0]!, stream);
      const channel = pc.createDataChannel("oai-events");
      dataChannelRef.current = channel;
      const failConnection = () => {
        if (voiceAttemptRef.current !== attempt) return;
        stopVoice();
        setVoiceState("error");
        setNotice("The live conversation was interrupted. Your composition is safe.");
      };
      channel.onopen = () => { setVoiceState("listening"); setAgentCaption("I’m listening."); };
      channel.onmessage = (message) => {
        let event: Record<string, unknown>;
        try { event = JSON.parse(String(message.data)) as Record<string, unknown>; } catch { return; }
        const type = String(event.type ?? "");
        if (type === "input_audio_buffer.speech_started") {
          setVoiceState("listening");
          if (channel.readyState === "open") channel.send(JSON.stringify({ type: "response.cancel" }));
        }
        if (type.includes("input_audio_transcription") && typeof event.delta === "string") setLiveCaption((value) => `${value}${event.delta}`);
        if (type.includes("input_audio_transcription") && typeof event.transcript === "string") { setLiveCaption(event.transcript); setTranscript(event.transcript); }
        if (type === "response.created") setVoiceState("thinking");
        if (type === "output_audio_buffer.started") setVoiceState("speaking");
        if (type === "output_audio_buffer.stopped" || type === "response.done") setVoiceState("listening");
        if (type.includes("output_audio_transcript") && typeof event.delta === "string") setAgentCaption((value) => type.endsWith(".delta") ? `${value}${event.delta}`.slice(-320) : value);
        if (type === "response.function_call_arguments.done") {
          const callId = String(event.call_id ?? "");
          const name = String(event.name ?? "");
          void executeRealtimeTool(name, String(event.arguments ?? "{}")).then((result) => {
            if (channel.readyState !== "open") return;
            channel.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }));
            channel.send(JSON.stringify({ type: "response.create" }));
          }).catch((error) => {
            if (channel.readyState !== "open") return;
            channel.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Tool failed" }) } }));
            channel.send(JSON.stringify({ type: "response.create" }));
          });
        }
      };
      channel.onerror = failConnection;
      channel.onclose = failConnection;
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) failConnection();
      };
      pc.oniceconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.iceConnectionState)) failConnection();
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "content-type": "application/sdp", "x-meant-workspace": workspaceId },
        body: offer.sdp,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error ?? "Live voice could not start.");
      }
      const answer = await response.text();
      if (voiceAttemptRef.current !== attempt) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      voiceSessionTimeoutRef.current = window.setTimeout(() => {
        if (voiceAttemptRef.current !== attempt) return;
        stopVoice();
        setNotice("Live voice ended after eight minutes. Start another session or keep working by typing.");
      }, VOICE_SESSION_MAXIMUM_MS);
    } catch (error) {
      if (voiceAttemptRef.current !== attempt) return;
      stopVoice();
      setVoiceState("error");
      setNotice(error instanceof Error ? error.message : "Live voice is unavailable. You can keep working by typing.");
    }
  }, [executeRealtimeTool, stopVoice, voiceState, workspaceId]);

  useEffect(() => () => stopVoice(), [stopVoice]);

  const submitTurn = useCallback(() => {
    const text = transcript.trim();
    if (!text) return;
    setTranscript("");
    if (/^(?:keep|keep it|keep this(?: exactly)?|use this|accept|that'?s it|this works)[.!]?$/i.test(text) && draftRef.current) {
      void keepDraft(draftRef.current.id);
      return;
    }
    if (/^(?:discard|never mind|go back|cancel that)[.!]?$/i.test(text) && draftRef.current) {
      discardDraft(draftRef.current.id);
      return;
    }
    if (/^undo(?: that| the last change)?[.!]?$/i.test(text)) {
      const latest = historyRef.current.find((item) => item.kind === "apply" && item.id.startsWith("composition-commit-") && item.revision === revisionRef.current);
      if (latest) void undoChange(latest.id, revisionRef.current);
      else setAgentCaption("There isn’t a latest kept change I can safely undo.");
      return;
    }
    const createMatch = text.match(/^(?:create|make|design|start)\s+(?:a|an)\s+(deck|poster|infographic)(?:\s+(?:about|for|on)\s+)(.+)$/i);
    if (createMatch) {
      createNewComposition({ kind: createMatch[1]!.toLowerCase() as CompositionKind, brief: createMatch[2]!.trim() });
      return;
    }
    previewTurn({ transcript: text });
  }, [createNewComposition, discardDraft, keepDraft, previewTurn, transcript, undoChange]);

  const activeDocument = draft?.preview ?? composition;
  const activeFrame = activeDocument.frames.find((frame) => frame.id === selectedFrameId) ?? activeDocument.frames[0]!;
  const keptFrame = composition.frames.find((frame) => frame.id === selectedFrameId);
  const selectedNode = activeFrame.nodes.find((node) => selectedNodeIds.includes(node.id));
  const canShape = hydrationReady && (saveState === "saved" || saveState === "local");
  const canUndo = !draft && sharedPersistenceReady && saveState === "saved" && history.some((item) => item.kind === "apply" && item.id.startsWith("composition-commit-") && item.revision === revision);
  const canKeep = Boolean(draft && workspaceId && sharedPersistenceReady && saveState === "saved");

  const toggleCompare = useCallback(() => {
    setCompareMode((value) => !value);
    setMobileCompareView("exploring");
  }, []);

  const previewSelectedNode = useCallback((summary: string, patch: { content?: string; style?: Partial<CompositionNode["style"]> }) => {
    const source = draftRef.current?.preview ?? compositionRef.current;
    const frame = source.frames.find((item) => item.id === selectedFrameRef.current);
    const nodeId = selectedNodesRef.current[0];
    if (!frame || !nodeId) return;
    const operation = createCompositionOperation(source, { kind: "node.update", frameId: frame.id, targetId: nodeId, patch });
    previewOperations(summary, [operation], createId("direct"));
  }, [previewOperations]);

  const addFrame = useCallback(() => {
    if (!hydrationReadyRef.current || (saveStateRef.current !== "saved" && saveStateRef.current !== "local") || draftRef.current) {
      setAgentCaption("Keep or discard the active direction, then wait for the authoritative workspace before adding a frame.");
      return;
    }
    const current = compositionRef.current;
    const source = current.frames.find((frame) => frame.id === selectedFrameRef.current) ?? current.frames.at(-1)!;
    const sourceTitle = source.nodes.find((node) => node.role === "title") ?? source.nodes[0]!;
    const frameId = createId("frame");
    const titleId = createId("title");
    const frame: CompositionFrame = {
      id: frameId,
      name: `Frame ${current.frames.length + 1}`,
      purpose: "Develop the next beat of the visual story",
      layout: "free",
      background: source.background,
      nodes: [{
        ...structuredClone(sourceTitle),
        id: titleId,
        name: "New frame title",
        role: "title",
        content: "What should this frame say?",
        locked: false,
        hidden: false,
      }],
    };
    const operation = createCompositionOperation(current, { kind: "frame.add", frameId, targetId: frameId, frame });
    selectedFrameRef.current = frameId;
    selectedNodesRef.current = [titleId];
    setSelectedFrameId(frameId);
    setSelectedNodeIds([titleId]);
    previewOperations(`Add frame ${current.frames.length + 1}`, [operation], createId("direct"));
  }, [previewOperations]);

  const titleFrom = (document: CompositionDocument) => document.frames
    .flatMap((frame) => frame.nodes)
    .find((node) => node.id === "opening-title")?.content ?? null;
  const e2eState = {
    workspaceId,
    revision,
    saveState,
    webMcpStatus,
    draftId: draft?.id ?? null,
    keptTitle: titleFrom(composition),
    activeTitle: titleFrom(activeDocument),
    history,
    historyHasMore,
    lastToolCall: e2eLastToolCall,
  };

  return (
    <main className="compose-shell">
      <header className="compose-topbar">
        <div className="compose-brand"><Image alt="Meant" className="compose-mark" height={28} priority src="/meant-mdot-reversed.svg" width={34} /><span>Make what you mean.</span></div>
        <div className="compose-title"><strong>{activeDocument.title}</strong><span>{activeDocument.kind} · {activeDocument.frames.length} {activeDocument.frames.length === 1 ? "frame" : "frames"}</span></div>
        <div className="compose-status">
          <span aria-atomic="true" aria-live="polite" className={`sync-state state-${saveState}`} role="status"><i />{saveState === "saved" ? `Saved · r${revision}` : saveState === "saving" ? "Keeping…" : saveState === "local" ? "Preview only" : saveState === "conflict" ? "Needs review" : "Opening…"}</span>
          {authRequired
            ? <a className="signin-cta" href="/signin-with-chatgpt?return_to=%2F">Sign in to save</a>
            : <span className={webMcpStatus === "ready" ? "agent-ready" : "agent-muted"}>{webMcpStatus === "ready" ? "Text ready" : webMcpStatus === "checking" ? "Checking text" : "Text unavailable"}</span>}
        </div>
      </header>

      <section className={`compose-workspace ${boardOpen ? "has-board" : ""}`}>
        <aside className={`storyboard ${boardOpen ? "is-open" : ""}`} aria-label="Storyboard">
          <div className="panel-heading"><div><span>Board</span><small>{activeDocument.frames.length} {activeDocument.frames.length === 1 ? "frame" : "frames"}</small></div><button aria-label="Add frame" disabled={Boolean(draft) || !canShape} onClick={addFrame} title={draft ? "Keep or discard the current direction first" : canShape ? "Add frame" : "Wait for the authoritative workspace"} type="button"><Plus /></button></div>
          <div className="storyboard-list">
            {activeDocument.frames.map((frame, index) => (
              <button className={`storyboard-item ${frame.id === activeFrame.id ? "is-active" : ""}`} key={frame.id} onClick={() => selectFrame(frame)} type="button">
                <span className="frame-number">{String(index + 1).padStart(2, "0")}</span>
                <FrameCanvas compact frame={frame} height={activeDocument.height} selectedNodeIds={[]} width={activeDocument.width} />
                <span className="frame-name">{frame.name}</span>
              </button>
            ))}
          </div>
          <div className="contract-note"><small>Design contract</small><span><strong>{activeDocument.designContract.character}</strong>{activeDocument.designContract.objective}</span></div>
        </aside>

        <section className="compose-stage-column">
          <div className="stage-toolbar">
            <div className="stage-location"><button aria-label="Toggle board" onClick={() => setBoardOpen((value) => !value)} type="button"><PanelLeft /></button><span>{activeFrame.name}</span><small>{selectedNode?.name ?? "Frame"}</small></div>
            <div className="stage-actions">
              <button className={compareMode ? "is-active" : ""} disabled={!draft} onClick={toggleCompare} type="button"><Columns2 />Compare</button>
              <button disabled={!canUndo} onClick={() => {
                const latest = history.find((item) => item.kind === "apply" && item.id.startsWith("composition-commit-") && item.revision === revision);
                if (latest) void undoChange(latest.id, revision);
              }} type="button"><RotateCcw />Undo</button>
              <button onClick={() => setHistoryOpen((value) => !value)} type="button"><History />History</button>
            </div>
          </div>

          <div className={`compose-stage ${compareMode ? "is-comparing" : ""}`}>
            {compareMode && draft ? (
              <div className="compare-grid">
                <div aria-label="Compare versions" className="mobile-compare-toggle" role="group"><button aria-pressed={mobileCompareView === "kept"} onClick={() => setMobileCompareView("kept")} type="button">View kept</button><button aria-pressed={mobileCompareView === "exploring"} onClick={() => setMobileCompareView("exploring")} type="button">View Exploring</button></div>
                <figure className={mobileCompareView === "kept" ? "is-mobile-active" : ""}><figcaption>{keptFrame ? `Kept · r${revision}` : "New frame · no kept counterpart"}</figcaption>{keptFrame ? <FrameCanvas frame={keptFrame} height={composition.height} selectedNodeIds={[]} width={composition.width} /> : <div className="compare-empty"><strong>This frame is new.</strong><span>There is no kept counterpart to compare yet.</span></div>}</figure>
                <figure className={mobileCompareView === "exploring" ? "is-mobile-active" : ""}><figcaption>Exploring · not yet kept</figcaption><FrameCanvas frame={activeFrame} height={activeDocument.height} selectedNodeIds={selectedNodeIds} onSelect={selectNode} width={activeDocument.width} /></figure>
              </div>
            ) : <FrameCanvas frame={activeFrame} height={activeDocument.height} selectedNodeIds={selectedNodeIds} onSelect={selectNode} width={activeDocument.width} />}
            {draft ? <div className="draft-badge"><span><i />Exploring</span><small>{draft.summary}</small></div> : null}
          </div>

          <div className="frame-nav">
            <button aria-label="Previous frame" disabled={activeDocument.frames[0]?.id === activeFrame.id} onClick={() => {
              const index = activeDocument.frames.findIndex((frame) => frame.id === activeFrame.id);
              const previous = activeDocument.frames[index - 1];
              if (previous) selectFrame(previous);
            }} type="button"><ChevronLeft /></button>
            <span>{activeDocument.frames.findIndex((frame) => frame.id === activeFrame.id) + 1} / {activeDocument.frames.length}</span>
            <button aria-label="Next frame" disabled={activeDocument.frames.at(-1)?.id === activeFrame.id} onClick={() => {
              const index = activeDocument.frames.findIndex((frame) => frame.id === activeFrame.id);
              const next = activeDocument.frames[index + 1];
              if (next) selectFrame(next);
            }} type="button"><ChevronRight /></button>
          </div>
        </section>

        <aside className={`compose-inspector ${historyOpen ? "show-history" : ""}`}>
          {historyOpen ? <>
            <div className="panel-heading"><div><span>History</span><small>Durable revision trail</small></div><button aria-label="Close history" onClick={() => setHistoryOpen(false)} type="button"><X /></button></div>
            <div className="history-list">
              {history.length ? history.map((item) => <article key={item.id}><i className={`history-dot kind-${item.kind}`} /><div><strong>{item.summary}</strong><span>Revision {item.revision} · {shortTime(item.committedAt)}</span>{item.revertedChangeId ? <small>Restored {item.revertedChangeId}</small> : null}</div></article>) : <p className="empty-copy">Keep a direction and its exact revision will appear here.</p>}
              {historyHasMore ? <button className="history-load-earlier" disabled={historyLoading} onClick={() => void loadEarlierHistory()} type="button">{historyLoading ? "Loading…" : "Load earlier revisions"}</button> : null}
            </div>
          </> : <>
            <div className="panel-heading"><div><span>{selectedNode?.name ?? "Frame"}</span><small>{selectedNode?.role ?? activeFrame.purpose}</small></div><Layers3 /></div>
            {selectedNode?.type === "text" ? <div className="inspector-controls">
              <label><span>Words</span><textarea onBlur={(event) => { if (event.currentTarget.value !== selectedNode.content) previewSelectedNode("Update the selected copy", { content: event.currentTarget.value }); }} defaultValue={selectedNode.content} key={`${selectedNode.id}-${selectedNode.content}`} /></label>
              <label><span>Size <output>{Math.round(selectedNode.style.fontSize)}</output></span><input aria-label="Text size" max="180" min="12" onChange={(event) => previewSelectedNode("Adjust the selected type scale", { style: { fontSize: Number(event.currentTarget.value) } })} type="range" value={Math.round(selectedNode.style.fontSize)} /></label>
              <fieldset><legend>Typeface</legend><div className="choice-row"><button className={selectedNode.style.fontFamily === "serif" ? "is-active" : ""} onClick={() => previewSelectedNode("Use an editorial serif", { style: { fontFamily: "serif" } })} type="button">Editorial</button><button className={selectedNode.style.fontFamily === "sans" ? "is-active" : ""} onClick={() => previewSelectedNode("Use a clean sans", { style: { fontFamily: "sans" } })} type="button">Clean</button></div></fieldset>
              <fieldset><legend>Ink</legend><div className="swatches">{["#191816", "#F04B32", "#666158", "#FFFCF5", "#F1D64B"].map((color) => <button aria-label={`Use ${color}`} className={selectedNode.style.color === color ? "is-active" : ""} key={color} onClick={() => previewSelectedNode(`Use ${color} on the selected text`, { style: { color } })} style={{ background: color }} type="button" />)}</div></fieldset>
              <p className="inspector-help">Touch establishes the referent. Voice carries the intent: “make this quieter,” “try a more editorial treatment,” or “keep this exactly.”</p>
            </div> : <div className="inspector-controls"><p className="empty-copy">Select a text layer on the canvas to tune it precisely, or describe the outcome by voice.</p></div>}
          </>}
        </aside>
      </section>

      <section className={`conversation-dock voice-${voiceState}`}>
        <button aria-label={voiceState === "idle" || voiceState === "error" ? "Start live voice" : "Stop live voice"} className="live-voice-button" disabled={!canShape} onClick={() => void startVoice()} type="button">
          {voiceState === "idle" || voiceState === "error" ? <Mic /> : voiceState === "speaking" ? <Volume2 /> : <CircleStop />}
          <span>{voiceState === "idle" ? "Talk" : voiceState === "connecting" ? "Joining" : voiceState === "listening" ? "Listening" : voiceState === "speaking" ? "Meant" : voiceState === "thinking" ? "Shaping" : "Retry"}</span>
        </button>
        <div aria-atomic="true" aria-live="polite" className="conversation-copy" role="status">
          <span className="conversation-state"><i />{draft ? "Exploring a reversible direction" : voiceState === "listening" ? "Say what should change" : "Design together in real time"}</span>
          <strong>{liveCaption || agentCaption}</strong>
          {notice ? <small>{notice}</small> : null}
        </div>
        <div className="conversation-input">
          <label htmlFor="composition-direction">Direction</label>
          <textarea disabled={!canShape} id="composition-direction" onChange={(event) => setTranscript(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitTurn(); } }} placeholder="Make the title quieter and more editorial…" rows={2} value={transcript} />
          <button aria-label="Send direction" disabled={!canShape || !transcript.trim()} onClick={submitTurn} type="button"><ArrowLeft /></button>
        </div>
        <div className="draft-actions">
          {draft ? <>
            <button className="discard-action" disabled={saveState === "saving"} onClick={() => discardDraft(draft.id)} type="button"><X />Discard</button>
            <button className="compare-action" onClick={toggleCompare} type="button"><Columns2 />Compare</button>
            <button className="keep-action" disabled={!canKeep} onClick={() => void keepDraft(draft.id)} title={canKeep ? "Keep this exact direction" : "Shared history must be available before Keep"} type="button"><Check />Keep</button>
          </> : <button className="new-action" disabled={!canShape} onClick={() => setNewComposerOpen(true)} type="button"><Plus />New composition</button>}
        </div>
      </section>

      {newComposerOpen ? <div className="new-composition-backdrop" onMouseDown={() => setNewComposerOpen(false)}>
        <section aria-describedby="new-composition-description" aria-labelledby="new-composition-title" aria-modal="true" className="new-composition-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
          <header><div><span>Start with intent</span><h2 id="new-composition-title">What are we making?</h2></div><button aria-label="Close new composition" onClick={() => setNewComposerOpen(false)} type="button"><X /></button></header>
          <p id="new-composition-description">Choose the visual form, then describe the idea in your own words. Meant will make an Exploring draft before anything is kept.</p>
          <div aria-label="Composition type" className="new-kind-grid" role="group">
            {(["deck", "poster", "infographic"] as const).map((kind) => <button aria-pressed={newKind === kind} className={newKind === kind ? "is-active" : ""} key={kind} onClick={() => setNewKind(kind)} type="button"><strong>{kind}</strong><span>{kind === "deck" ? "A visual story in frames" : kind === "poster" ? "One idea at a glance" : "A structured visual explanation"}</span></button>)}
          </div>
          <label><span>Tell Meant what is in your head</span><textarea autoFocus onChange={(event) => setNewBrief(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && newBrief.trim()) createNewComposition({ kind: newKind, brief: newBrief }); }} placeholder="A neighborhood climate action plan that feels practical, hopeful, and specific…" rows={5} value={newBrief} /></label>
          <footer><small>⌘ Enter to create</small><button disabled={!newBrief.trim()} onClick={() => createNewComposition({ kind: newKind, brief: newBrief })} type="button"><Plus />Create Exploring draft</button></footer>
        </section>
      </div> : null}
      {e2eMode ? <aside className="e2e-test-panel" data-testid="composition-e2e-panel">
        <details open>
          <summary data-testid="composition-e2e-collapse">Evidence controls</summary>
          <label>Registered WebMCP call<textarea data-testid="composition-e2e-webmcp-input" onChange={(event) => setE2eToolInput(event.currentTarget.value)} value={e2eToolInput} /></label>
          <button data-testid="composition-e2e-webmcp-execute" onClick={() => void executeE2EWebMcpTool()} type="button">Execute registered WebMCP tool</button>
          <button data-testid="composition-e2e-refetch" onClick={() => void refetch()} type="button">Refetch authoritative project</button>
          <output data-testid="composition-e2e-state">{JSON.stringify(e2eState)}</output>
        </details>
      </aside> : null}
    </main>
  );
}
