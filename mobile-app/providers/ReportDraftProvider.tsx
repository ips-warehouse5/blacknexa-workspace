/**
 * The report wizard's state — screens C1 through C11, and F1's Resume.
 *
 * ── Local-first, deliberately ──────────────────────────────────────────────
 * The header on C1–C7 shows "Draft saved · 9:41 PM". That timestamp reflects the
 * **local** write, because it has to be honest with no signal: a person filing a
 * report in a stairwell with one bar should still see that their words are safe.
 * The server copy is a background sync, and a failed sync never blocks a step.
 *
 * ── Uploads outlive the screen ─────────────────────────────────────────────
 * C5 shows per-file progress and C10 promises a draft "keeps everything you have
 * written and the two files you attached". So the upload queue lives here rather
 * than in the C5 component: navigating away, or backgrounding the app, must not
 * abandon a 25 MB video at 60%.
 *
 * ── Revision 2: reliability (docs/INCIDENT_MODULE_PLAN.md §10) ─────────────
 * The wizard used to lose work in ways nobody could see. Each rule below closes
 * one of them:
 *
 *   • **One server draft per wizard.** `ensureDraftId` is single-flight, and every
 *     server save runs on one queue that reads the *newest* snapshot when it runs.
 *     Before, debounced saves and parallel uploads each created their own draft,
 *     and files landed on drafts the report was never filed from.
 *   • **The snapshot lives in a ref.** Every change is applied to `snapshotRef`
 *     synchronously and persisted from it, so a save can no longer write an older
 *     payload over a newer one from a stale closure.
 *   • **The final save must land.** Filing reads the server's copy, so C8 files
 *     only after the last save succeeded — otherwise it would file whatever older
 *     version the server had. A failed save is shown; nothing is filed.
 *   • **Filing is safe to repeat (D12).** The server answers a re-post of a
 *     consumed draft with the report it became. So before saving, the wizard asks
 *     whether its draft still exists: saving to a draft that was already filed
 *     would silently create a *new* draft, and filing that would be a second
 *     report.
 *   • **A retry re-uploads what never arrived.** A presigned file whose upload
 *     never confirmed can never seal, so its retry — or its restore after the app
 *     was killed — drops that server row and presigns afresh. A file that did
 *     upload but whose commit was lost is committed again, not re-sent.
 *   • **The server's file list and the device's agree before filing.** Rows the
 *     device no longer knows (removed while offline, left by a restarted upload)
 *     are removed, because filing refuses unsealed files and would publish sealed
 *     ones the person never saw; files the device thinks are sealed but the server
 *     does not have go back to upload.
 *   • **Resume by id.** F1's draft rows open `/report?draftId=…`; the entry screen
 *     stages that server draft here and, once any different local draft has been
 *     saved or discarded through C10, adopts it — payload and sealed files.
 */

import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import reportsApi, {
  type DraftPayload,
  type EvidenceKind,
  type EvidenceView,
  type FilingReceipt,
} from "@/lib/api/reports";
import { ApiError } from "@/lib/api/client";
import { hashFile, makeThumbnail, putFile } from "@/lib/evidence-upload";

const STORAGE_KEY = "bn.report_draft.v1";
/** C1–C7 autosave cadence. Long enough not to thrash, short enough to feel live. */
const AUTOSAVE_DEBOUNCE_MS = 400;
const TOTAL_STEPS = 7;

/** One attachment, tracked from picker to sealed. */
export interface DraftAttachment {
  /** Local id, stable across the whole lifecycle. */
  localId: string;
  kind: EvidenceKind;
  mime: string;
  /**
   * Local file URI. Held until the upload succeeds — C10's promise. Empty for a
   * file restored from a server draft (F1 → Resume): it is already sealed, so
   * nothing on this device needs to be read again.
   */
  uri: string;
  bytes: number;
  durationMs?: number;
  capturedAt?: string;
  /** Server id, once presigned. */
  evidenceId?: string;
  /**
   * True once the PUT to the presigned slot answered 2xx. Without it a retry
   * cannot tell "the bytes are there, the commit was lost" (commit again) from
   * "the bytes never arrived" (that row can never seal — presign afresh).
   */
  uploaded?: boolean;
  /** Whether a preview went up with it — repeated if the commit has to be. */
  thumbUploaded?: boolean;
  state: "queued" | "uploading" | "sealed" | "failed";
  /** 0–1, for C5's progress bar. */
  progress: number;
  error?: string;
  sealedAt?: string;
}

/** What the wizard holds. Mirrored in a ref — see the file header. */
interface DraftSnapshot {
  draftId?: string;
  step: number;
  payload: DraftPayload;
  attachments: DraftAttachment[];
}

interface PersistedDraft extends DraftSnapshot {
  savedAt: string;
}

/** A server draft, fetched for F1's Resume before the local slot is replaced. */
export interface ServerDraft {
  id: string;
  step: number;
  payload: DraftPayload;
  updatedAt: string;
  /** Every file on it, sealed or not; only sealed ones are adopted. */
  evidence: EvidenceView[];
}

export type StageOutcome =
  | { status: "ok"; draft: ServerDraft }
  /** Filed, discarded, or not this account's — the server no longer has it as a draft. */
  | { status: "gone" }
  | { status: "failed"; message: string };

/** What C10 reports back: whether the server now holds the latest copy. */
export interface SaveOutcome {
  saved: boolean;
  /** Why not, in the server's words or the client's, when `saved` is false. */
  message?: string;
}

/** C8's three endings. */
export type FileOutcome =
  | { status: "filed"; receipt: FilingReceipt }
  /**
   * Some files had to go back to upload (the server did not have them sealed).
   * Nothing was filed; C8 keeps waiting and files once they seal.
   */
  | { status: "reupload"; count: number }
  | { status: "failed"; message: string };

interface DraftState {
  ready: boolean;
  draftId?: string;
  step: number;
  payload: DraftPayload;
  attachments: DraftAttachment[];
  /** What the C1–C7 header prints. */
  savedAt: string | null;
  /** True while a filing attempt is in flight. */
  filing: boolean;
  fileError: string | null;

  /** True when there is anything worth keeping — decides whether C10 appears. */
  hasContent: boolean;
  /** How many of the seven steps have their required fields. */
  completedSteps: number;

  setStep: (step: number) => void;
  patch: (values: DraftPayload) => void;
  reset: () => void;
  /** C11 — delete locally and on the server. */
  discard: () => Promise<void>;
  /** C10 — keep it, and make sure the server has it. Never throws. */
  saveNow: () => Promise<SaveOutcome>;

  /** F1 → Resume: fetch a server draft and hold it until C10 has been answered. */
  stageServerDraft: (draftId: string) => Promise<StageOutcome>;
  /** The draft `stageServerDraft` fetched, until adopted or cleared. */
  stagedDraft: ServerDraft | null;
  /** Replace the local draft with the staged one. Resolves with the step to open. */
  adoptStagedDraft: () => Promise<number | null>;
  clearStagedDraft: () => void;

  addAttachment: (
    input: Omit<DraftAttachment, "localId" | "state" | "progress" | "evidenceId" | "uploaded">,
  ) => void;
  removeAttachment: (localId: string) => Promise<void>;
  retryAttachment: (localId: string) => void;
  /** C8's Try again: every failed file back to the queue. Returns how many. */
  retryFailed: () => number;
  /** True once every attachment is sealed — C8 will not file before this. */
  allSealed: boolean;
  /** Queued or uploading. Failed files are counted separately. */
  uploadingCount: number;
  failedCount: number;

  /** C7 → C8 → C9. */
  fileReport: () => Promise<FileOutcome>;
}

/** Which fields each wizard step requires before it counts as done. */
function stepIsComplete(step: number, payload: DraftPayload): boolean {
  switch (step) {
    case 1:
      return Boolean(payload.category);
    case 2:
      return Boolean(payload.title?.trim() && payload.body?.trim());
    case 3:
      return Boolean(payload.occurredAt);
    case 4:
      // C4 is satisfied by a precision alone: "Hidden" is a complete answer.
      return Boolean(payload.locationPrecision);
    case 5:
      // C5 is labelled Optional in the artboard.
      return true;
    case 6:
      return Boolean(payload.visibility);
    case 7:
      return true;
    default:
      return false;
  }
}

/** How many of the seven steps a payload satisfies — C10's and F1's "3 of 7 steps done". */
function completedStepsOf(payload: DraftPayload): number {
  let count = 0;
  for (let index = 1; index <= TOTAL_STEPS; index += 1) {
    if (stepIsComplete(index, payload)) count += 1;
  }
  return count;
}

function clampStep(value: unknown): number {
  const step = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(Math.max(step, 1), TOTAL_STEPS);
}

/** The server validates durations as integers; pickers report fractional milliseconds. */
function wholeMs(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/**
 * A commit the server refused outright (4xx) has marked that row failed: the
 * next attempt has to start from a fresh presign. A network failure or a 5xx
 * leaves the uploaded bytes usable, so the next attempt commits again.
 */
function isRefusal(err: unknown): boolean {
  return err instanceof ApiError && !err.offline && err.status >= 400 && err.status < 500;
}

/** Thrown when the local file behind an attachment is gone (cache purged, or restored from the server unsealed). */
class LocalFileMissingError extends Error {
  constructor() {
    super("local file missing");
    this.name = "LocalFileMissingError";
  }
}

/** Thrown when the wizard was reset or switched while a request was in flight. */
class StaleDraftError extends Error {
  constructor() {
    super("stale draft");
    this.name = "StaleDraftError";
  }
}

const EMPTY_SNAPSHOT: DraftSnapshot = { draftId: undefined, step: 1, payload: {}, attachments: [] };

const LOCAL_FILE_MISSING =
  "This file is no longer on your device. Remove it and attach it again.";
const UPLOAD_DID_NOT_FINISH = "That file did not finish uploading. Tap to try again.";

/** A sealed server file as a C5 row. It has no local file and never needs one. */
function attachmentFromServer(file: EvidenceView): DraftAttachment {
  return {
    localId: `srv_${file.id}`,
    kind: file.kind,
    mime: file.mime,
    uri: "",
    bytes: file.bytes,
    durationMs: file.durationMs ?? undefined,
    capturedAt: file.capturedAt ?? undefined,
    evidenceId: file.id,
    uploaded: true,
    state: "sealed",
    progress: 1,
    sealedAt: file.sealedAt ?? undefined,
  };
}

export const [ReportDraftProvider, useReportDraft] = createContextHook<DraftState>(() => {
  const queryClient = useQueryClient();

  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<DraftSnapshot>(EMPTY_SNAPSHOT);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [stagedDraft, setStagedDraft] = useState<ServerDraft | null>(null);

  /** The source of truth every save reads — see the file header. */
  const snapshotRef = useRef<DraftSnapshot>(EMPTY_SNAPSHOT);
  const savedAtRef = useRef<string | null>(null);
  /**
   * Bumped whenever the wizard starts over (reset, discard, filed, resumed). Every
   * async task captures it and drops its result if it changed meanwhile, so a late
   * answer about the old draft can never be written into the new one.
   */
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Local writes, in order — a slow early write cannot land after a later one. */
  const localWriteRef = useRef<Promise<void>>(Promise.resolve());
  /** Server draft writes (saves, discard, filing), one at a time. */
  const serverQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  /** The single in-flight draft creation, shared by every caller. */
  const createRef = useRef<Promise<string> | null>(null);
  /** The payload object and step the server was last confirmed to hold. */
  const lastSyncedRef = useRef<{ draftId: string; payload: DraftPayload; step: number } | null>(null);
  /** Guards against two uploads starting for the same attachment. */
  const uploadingRef = useRef<Set<string>>(new Set());
  /** Attachments removed while their upload was still running. */
  const removedRef = useRef<Set<string>>(new Set());
  const filingRef = useRef<Promise<FileOutcome> | null>(null);
  /** `stagedDraft`, readable by a callback created before it was staged. */
  const stagedRef = useRef<ServerDraft | null>(null);

  const stage = useCallback((draft: ServerDraft | null) => {
    stagedRef.current = draft;
    setStagedDraft(draft);
  }, []);

  // ── Snapshot plumbing ─────────────────────────────────────────────────────

  const apply = useCallback(
    (changes: Partial<DraftSnapshot> | ((current: DraftSnapshot) => Partial<DraftSnapshot>)) => {
      const current = snapshotRef.current;
      const delta = typeof changes === "function" ? changes(current) : changes;
      const next: DraftSnapshot = { ...current, ...delta };
      snapshotRef.current = next;
      setSnapshot(next);
      return next;
    },
    [],
  );

  /**
   * Persist the newest snapshot. `touch` moves the header's "Draft saved" time —
   * content changes do, upload bookkeeping does not.
   */
  const writeLocal = useCallback((touch: boolean): Promise<void> => {
    const generation = generationRef.current;
    if (touch) {
      const now = new Date().toISOString();
      savedAtRef.current = now;
      setSavedAt(now);
    }
    localWriteRef.current = localWriteRef.current.then(async () => {
      // A write queued before a reset must not resurrect the old draft.
      if (generation !== generationRef.current) return;
      const record: PersistedDraft = {
        ...snapshotRef.current,
        savedAt: savedAtRef.current ?? new Date().toISOString(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record)).catch(() => {});
    });
    return localWriteRef.current;
  }, []);

  /** Run a server draft write after every earlier one, whether or not it failed. */
  const enqueueServer = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = serverQueueRef.current.then(task, task);
    serverQueueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  // ── Restore ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const stored = JSON.parse(raw) as Partial<PersistedDraft>;
          // An upload interrupted by a kill comes back queued, and takes the same
          // path as a retry: committed again if its bytes had arrived, presigned
          // afresh if they had not. The local URI is still on disk — the point of
          // holding it.
          const attachments = (Array.isArray(stored.attachments) ? stored.attachments : [])
            .filter((item) => item && typeof item.localId === "string")
            .map((item) =>
              item.state === "uploading" ? { ...item, state: "queued" as const, progress: 0 } : item,
            );
          apply({
            draftId: typeof stored.draftId === "string" ? stored.draftId : undefined,
            step: clampStep(stored.step),
            payload: stored.payload ?? {},
            attachments,
          });
          savedAtRef.current = stored.savedAt ?? null;
          setSavedAt(stored.savedAt ?? null);
        }
      } catch {
        /* a corrupt draft is dropped rather than blocking the wizard */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // ── The server draft ──────────────────────────────────────────────────────

  /**
   * Make sure a server draft exists. Single-flight: parallel uploads and the
   * autosave all wait on one creation instead of each making their own draft.
   */
  const ensureDraftId = useCallback((): Promise<string> => {
    const existing = snapshotRef.current.draftId;
    if (existing) return Promise.resolve(existing);
    if (createRef.current) return createRef.current;

    const generation = generationRef.current;
    const sent = snapshotRef.current;
    const pending: Promise<string> = reportsApi
      .saveDraft(sent.step, sent.payload)
      .then((result) => {
        if (generation !== generationRef.current) {
          // The wizard started over while this was in flight: the new draft
          // belongs to nothing, so it is not left behind in the Vault.
          void reportsApi.discardDraft(result.draftId).catch(() => {});
          throw new StaleDraftError();
        }
        apply({ draftId: result.draftId });
        lastSyncedRef.current = { draftId: result.draftId, payload: sent.payload, step: sent.step };
        void writeLocal(false);
        return result.draftId;
      })
      .finally(() => {
        if (createRef.current === pending) createRef.current = null;
      });
    createRef.current = pending;
    return pending;
  }, [apply, writeLocal]);

  /**
   * Bring the server copy up to date with the newest snapshot. Throws on failure;
   * the autosave swallows that, C8 and C10 do not.
   *
   * Resolves with the draft id the server holds now — a different one when the old
   * draft had vanished (filed or discarded elsewhere) and the save started a new
   * one, which filing must know about.
   */
  const pushDraft = useCallback(
    async (generation: number, force: boolean): Promise<string> => {
      if (generation !== generationRef.current) throw new StaleDraftError();
      const draftId = await ensureDraftId();
      if (generation !== generationRef.current) throw new StaleDraftError();

      const current = snapshotRef.current;
      const synced = lastSyncedRef.current;
      if (
        !force &&
        synced &&
        synced.draftId === draftId &&
        synced.payload === current.payload &&
        synced.step === current.step
      ) {
        return draftId;
      }

      const result = await reportsApi.saveDraft(current.step, current.payload, draftId);
      if (generation !== generationRef.current) throw new StaleDraftError();
      if (result.draftId !== draftId) {
        apply({ draftId: result.draftId });
        void writeLocal(false);
      }
      lastSyncedRef.current = {
        draftId: result.draftId,
        payload: current.payload,
        step: current.step,
      };
      return result.draftId;
    },
    [apply, ensureDraftId, writeLocal],
  );

  /** Debounced local write plus server sync. Every field change funnels through here. */
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const generation = generationRef.current;
      void writeLocal(true);
      // Offline, or the server said no: the local copy stands and the next change
      // tries again. A step must never wait on this.
      void enqueueServer(() => pushDraft(generation, false)).catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [enqueueServer, pushDraft, writeLocal]);

  const cancelScheduledSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  // ── Editing ───────────────────────────────────────────────────────────────

  const patch = useCallback(
    (values: DraftPayload) => {
      apply((current) => ({ payload: { ...current.payload, ...values } }));
      scheduleSave();
    },
    [apply, scheduleSave],
  );

  const setStep = useCallback(
    (nextStep: number) => {
      apply({ step: clampStep(nextStep) });
      scheduleSave();
    },
    [apply, scheduleSave],
  );

  /** Start over: a new generation, nothing local. The server draft is untouched. */
  const startOver = useCallback(
    (next: DraftSnapshot, nextSavedAt: string | null) => {
      generationRef.current += 1;
      cancelScheduledSave();
      createRef.current = null;
      lastSyncedRef.current = null;
      uploadingRef.current = new Set();
      removedRef.current = new Set();
      apply(next);
      savedAtRef.current = nextSavedAt;
      setSavedAt(nextSavedAt);
      setFileError(null);
    },
    [apply, cancelScheduledSave],
  );

  const reset = useCallback(() => {
    startOver(EMPTY_SNAPSHOT, null);
    localWriteRef.current = localWriteRef.current.then(() =>
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {}),
    );
  }, [startOver]);

  /**
   * C11 — discard.
   *
   * The local copy goes first — the person asked for it gone, and leaving it on
   * their device would be the wrong half to keep. The server delete then runs
   * after any save already on its way, so a late save cannot recreate the draft.
   */
  const discard = useCallback(async () => {
    const pendingCreate = createRef.current;
    const draftId = snapshotRef.current.draftId;
    reset();
    const target = draftId ?? (pendingCreate ? await pendingCreate.catch(() => undefined) : undefined);
    if (target) {
      await enqueueServer(() => reportsApi.discardDraft(target)).catch(() => {});
    }
    void queryClient.invalidateQueries({ queryKey: ["drafts"] });
  }, [enqueueServer, queryClient, reset]);

  const saveNow = useCallback(async (): Promise<SaveOutcome> => {
    cancelScheduledSave();
    const generation = generationRef.current;
    await writeLocal(true);
    try {
      await enqueueServer(() => pushDraft(generation, true));
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
      return { saved: true };
    } catch (err) {
      return {
        saved: false,
        message: messageOf(err, "That draft could not reach your account."),
      };
    }
  }, [cancelScheduledSave, enqueueServer, pushDraft, queryClient, writeLocal]);

  // ── F1 → Resume ───────────────────────────────────────────────────────────

  const stageServerDraft = useCallback(async (draftId: string): Promise<StageOutcome> => {
    try {
      // There is no single-draft read; the list is the caller's twenty newest,
      // which is where F1's row came from.
      const [drafts, evidence] = await Promise.all([
        reportsApi.listDrafts(),
        reportsApi.draftEvidence(draftId),
      ]);
      const summary = drafts.find((draft) => draft.id === draftId);
      if (!summary) return { status: "gone" };
      const draft: ServerDraft = {
        id: summary.id,
        step: clampStep(summary.step),
        payload: summary.payload ?? {},
        updatedAt: summary.updatedAt,
        evidence,
      };
      stage(draft);
      return { status: "ok", draft };
    } catch (err) {
      if (isNotFound(err)) return { status: "gone" };
      return { status: "failed", message: messageOf(err, "That draft could not be opened. Try again.") };
    }
  }, [stage]);

  const clearStagedDraft = useCallback(() => stage(null), [stage]);

  /**
   * Replace the local slot with the staged server draft. Only its sealed files
   * come across: an unsealed one has no bytes on this device to finish with, and
   * the check before filing removes it from the server.
   */
  const adoptStagedDraft = useCallback(async (): Promise<number | null> => {
    const draft = stagedRef.current;
    if (!draft) return null;
    startOver(
      {
        draftId: draft.id,
        step: draft.step,
        payload: draft.payload,
        attachments: draft.evidence
          .filter((file) => file.uploadState === "sealed")
          .map(attachmentFromServer),
      },
      draft.updatedAt,
    );
    lastSyncedRef.current = {
      draftId: draft.id,
      payload: snapshotRef.current.payload,
      step: draft.step,
    };
    stage(null);
    await writeLocal(false);
    return draft.step;
  }, [stage, startOver, writeLocal]);

  // ── Uploads ───────────────────────────────────────────────────────────────

  const setAttachment = useCallback(
    (localId: string, changes: Partial<DraftAttachment>, persist: boolean) => {
      apply((current) => ({
        attachments: current.attachments.map((item) =>
          item.localId === localId ? { ...item, ...changes } : item,
        ),
      }));
      // Progress ticks stay in memory: a write per percent is a lot of writes, and
      // an interrupted upload restarts from its last confirmed stage anyway.
      if (persist) void writeLocal(false);
    },
    [apply, writeLocal],
  );

  /**
   * Presign → upload → commit, for one attachment — resuming from whichever of
   * those it last confirmed.
   *
   * The SHA-256 is computed from the local file's **raw bytes**, and the server
   * recomputes it from what actually landed. A mismatch is a refusal, not a
   * warning, which is what makes "Sealed" on C5 mean something — see
   * `lib/evidence-upload.ts`. A photo also gets a small preview uploaded to a
   * second presigned slot, so the feed does not download the original to paint a
   * card.
   */
  const runUpload = useCallback(
    async (localId: string) => {
      if (uploadingRef.current.has(localId)) return;
      const initial = snapshotRef.current.attachments.find((item) => item.localId === localId);
      if (!initial || initial.state !== "queued") return;

      const uploading = uploadingRef.current;
      uploading.add(localId);
      const generation = generationRef.current;
      const alive = () => generation === generationRef.current && !removedRef.current.has(localId);

      let evidenceId = initial.evidenceId;
      let uploaded = initial.uploaded === true && Boolean(evidenceId);
      let thumbUploaded = initial.thumbUploaded === true;
      setAttachment(
        localId,
        { state: "uploading", progress: uploaded ? 0.99 : 0, error: undefined },
        true,
      );

      try {
        if (!initial.uri) throw new LocalFileMissingError();
        // The OS may have purged the cache the picker copied into. A platform that
        // cannot answer (null) is not treated as a missing file.
        const info = await FileSystem.getInfoAsync(initial.uri).catch(() => null);
        if (info && !info.exists) throw new LocalFileMissingError();

        const draftId = await ensureDraftId();
        if (!alive()) return;

        if (evidenceId && !uploaded) {
          // Presigned, but the upload never confirmed: that row can never seal.
          // Best-effort removal — anything left is reconciled before filing.
          void reportsApi.removeEvidence(evidenceId).catch(() => {});
          evidenceId = undefined;
          thumbUploaded = false;
          setAttachment(localId, { evidenceId: undefined, uploaded: false, thumbUploaded: false }, true);
        }

        if (!evidenceId) {
          const presign = await reportsApi.presignEvidence({
            kind: initial.kind,
            mime: initial.mime,
            bytes: Math.max(1, Math.round(initial.bytes)),
            durationMs: wholeMs(initial.durationMs),
            capturedAt: initial.capturedAt,
            draftId,
          });
          if (!alive()) {
            void reportsApi.removeEvidence(presign.evidenceId).catch(() => {});
            return;
          }
          const presignedId = presign.evidenceId;
          evidenceId = presignedId;
          setAttachment(localId, { evidenceId: presignedId, uploaded: false }, true);

          // `createUploadTask` reports real progress for a large file, which is
          // what C5 draws — a fetch with a blob body would jump from 0 to 100.
          let lastPercent = -1;
          const task = FileSystem.createUploadTask(
            presign.uploadUrl,
            initial.uri,
            {
              httpMethod: "PUT",
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              headers: presign.headers,
            },
            (progress) => {
              if (!alive()) return;
              const ratio =
                progress.totalBytesExpectedToSend > 0
                  ? progress.totalBytesSent / progress.totalBytesExpectedToSend
                  : 0;
              const percent = Math.floor(Math.min(0.99, ratio) * 100);
              if (percent === lastPercent) return;
              lastPercent = percent;
              setAttachment(localId, { progress: percent / 100 }, false);
            },
          );
          const result = await task.uploadAsync();
          if (!result || result.status >= 300) {
            throw new Error(`Upload rejected (${result?.status ?? "no response"})`);
          }
          if (!alive()) {
            void reportsApi.removeEvidence(presignedId).catch(() => {});
            return;
          }
          uploaded = true;

          // The preview, before the commit. Best-effort throughout: a failure
          // leaves `thumbUploaded` false and the card falls back to its text-first
          // variant, rather than losing an attachment over a convenience.
          if (presign.thumbUploadUrl && initial.kind === "photo") {
            const thumbUri = await makeThumbnail(initial.uri);
            if (thumbUri) {
              thumbUploaded = await putFile(
                presign.thumbUploadUrl,
                thumbUri,
                presign.thumbHeaders ?? { "Content-Type": "image/jpeg" },
              );
            }
          }
          setAttachment(localId, { uploaded: true, thumbUploaded, progress: 0.99 }, true);
        }

        const committedId = evidenceId;
        const sha256 = await hashFile(initial.uri);
        const sealed = await reportsApi.commitEvidence(committedId, {
          sha256,
          capturedAt: initial.capturedAt,
          durationMs: wholeMs(initial.durationMs),
          thumbUploaded,
        });
        if (!alive()) {
          // Removed while it sealed: a draft's file can still be deleted.
          if (generation === generationRef.current) {
            void reportsApi.removeEvidence(committedId).catch(() => {});
          }
          return;
        }
        setAttachment(
          localId,
          {
            state: "sealed",
            progress: 1,
            uploaded: true,
            sealedAt: sealed.sealedAt ?? new Date().toISOString(),
            error: undefined,
          },
          true,
        );
      } catch (err) {
        if (generation !== generationRef.current || err instanceof StaleDraftError) return;
        if (removedRef.current.has(localId)) {
          if (evidenceId) void reportsApi.removeEvidence(evidenceId).catch(() => {});
          return;
        }
        // A refused commit has marked that row failed server-side, so the retry
        // must presign afresh; a lost connection leaves the bytes usable.
        const restart = uploaded && isRefusal(err);
        setAttachment(
          localId,
          {
            state: "failed",
            error:
              err instanceof LocalFileMissingError
                ? LOCAL_FILE_MISSING
                : messageOf(err, UPLOAD_DID_NOT_FINISH),
            ...(restart ? { uploaded: false } : {}),
          },
          true,
        );
      } finally {
        uploading.delete(localId);
      }
    },
    [ensureDraftId, setAttachment],
  );

  /** Drain the queue whenever something is waiting — never before the restore settles. */
  useEffect(() => {
    if (!ready) return;
    for (const item of snapshot.attachments) {
      if (item.state === "queued" && !uploadingRef.current.has(item.localId)) {
        void runUpload(item.localId);
      }
    }
  }, [ready, runUpload, snapshot.attachments]);

  const addAttachment = useCallback(
    (
      input: Omit<DraftAttachment, "localId" | "state" | "progress" | "evidenceId" | "uploaded">,
    ) => {
      const attachment: DraftAttachment = {
        ...input,
        localId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        state: "queued",
        progress: 0,
      };
      apply((current) => ({ attachments: [...current.attachments, attachment] }));
      void writeLocal(true);
    },
    [apply, writeLocal],
  );

  const removeAttachment = useCallback(
    async (localId: string) => {
      const target = snapshotRef.current.attachments.find((item) => item.localId === localId);
      if (!target) return;
      // Marked first, so an upload still running for it cleans up after itself.
      removedRef.current.add(localId);
      apply((current) => ({
        attachments: current.attachments.filter((item) => item.localId !== localId),
      }));
      void writeLocal(true);
      if (target.evidenceId) {
        // Offline, this leaves a row behind; the check before filing removes it.
        await reportsApi.removeEvidence(target.evidenceId).catch(() => {});
      }
    },
    [apply, writeLocal],
  );

  const retryAttachment = useCallback(
    (localId: string) => {
      const target = snapshotRef.current.attachments.find((item) => item.localId === localId);
      if (!target || target.state !== "failed") return;
      // Back to queued; the drain effect picks it up and `runUpload` decides
      // whether it needs a fresh presign. The local file is still there, so
      // nothing has to be re-picked — C8's retry promise.
      setAttachment(localId, { state: "queued", progress: 0, error: undefined }, true);
    },
    [setAttachment],
  );

  const retryFailed = useCallback((): number => {
    let count = 0;
    apply((current) => ({
      attachments: current.attachments.map((item) => {
        if (item.state !== "failed") return item;
        count += 1;
        return { ...item, state: "queued" as const, progress: 0, error: undefined };
      }),
    }));
    if (count > 0) void writeLocal(false);
    return count;
  }, [apply, writeLocal]);

  // ── Filing ────────────────────────────────────────────────────────────────

  /** File a draft that may already have been filed. Null when the server has no such draft. */
  const fileExisting = useCallback(async (draftId: string): Promise<FilingReceipt | null> => {
    try {
      return await reportsApi.file(draftId);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }, []);

  /**
   * Make the server's file list match the device's (see the file header). Returns
   * how many files went back to upload, or a message when some cannot.
   */
  const reconcileFiles = useCallback(
    async (serverFiles: EvidenceView[]): Promise<{ requeued: number; lost: number }> => {
      const known = new Set(
        snapshotRef.current.attachments
          .map((item) => item.evidenceId)
          .filter((id): id is string => Boolean(id)),
      );
      for (const orphan of serverFiles.filter((file) => !known.has(file.id))) {
        try {
          await reportsApi.removeEvidence(orphan.id);
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }
      }

      const byId = new Map(serverFiles.map((file) => [file.id, file]));
      let requeued = 0;
      let lost = 0;
      apply((current) => ({
        attachments: current.attachments.map((item) => {
          if (item.state !== "sealed") return item;
          const row = item.evidenceId ? byId.get(item.evidenceId) : undefined;
          if (row && row.uploadState === "sealed") return item;
          if (!item.uri) {
            lost += 1;
            return {
              ...item,
              state: "failed" as const,
              error: "This file is no longer attached. Remove it and attach it again.",
            };
          }
          requeued += 1;
          // Still on the server but unsealed: commit it again. Gone: start over.
          return row
            ? { ...item, state: "queued" as const, progress: 0 }
            : {
                ...item,
                state: "queued" as const,
                progress: 0,
                evidenceId: undefined,
                uploaded: false,
                thumbUploaded: false,
              };
        }),
      }));
      if (requeued > 0 || lost > 0) void writeLocal(false);
      return { requeued, lost };
    },
    [apply, writeLocal],
  );

  /** The server half of filing, run on the draft queue. See the file header. */
  const fileOnServer = useCallback(
    async (generation: number): Promise<FileOutcome> => {
      const pending = snapshotRef.current.attachments.filter((item) => item.state !== "sealed");
      if (pending.length > 0) {
        return {
          status: "failed",
          message: `${pending.length} file${pending.length === 1 ? " has" : "s have"} not finished uploading. Nothing has been filed.`,
        };
      }

      // 1. Is this wizard's server draft still a draft? A 404 means an earlier
      //    attempt filed it and the answer was lost — filing again returns that
      //    report (D12) — or it was discarded elsewhere.
      let draftId = snapshotRef.current.draftId;
      let serverFiles: EvidenceView[] | null = null;
      if (draftId) {
        try {
          serverFiles = await reportsApi.draftEvidence(draftId);
        } catch (err) {
          if (!isNotFound(err)) throw err;
          const settled = await fileExisting(draftId);
          if (settled) return { status: "filed", receipt: settled };
          // Never filed: a fresh server draft is made from the local copy below.
          apply({ draftId: undefined });
          lastSyncedRef.current = null;
          draftId = undefined;
          void writeLocal(false);
        }
      }

      // 2. The final save. It must land: filing reads the server's copy.
      let saved: string;
      try {
        saved = await pushDraft(generation, true);
      } catch (err) {
        if (err instanceof StaleDraftError) throw err;
        return {
          status: "failed",
          message: `Nothing has been filed — your latest changes did not save. ${messageOf(
            err,
            "Try again.",
          )}`,
        };
      }
      if (draftId && saved !== draftId) {
        // The old draft vanished between the check and the save — a filing from
        // an earlier attempt landing late. Its report is the answer.
        const settled = await fileExisting(draftId);
        if (settled) {
          void reportsApi.discardDraft(saved).catch(() => {});
          return { status: "filed", receipt: settled };
        }
        serverFiles = null;
      }

      // 3. The files, reconciled.
      const files = serverFiles ?? (await reportsApi.draftEvidence(saved));
      const { requeued, lost } = await reconcileFiles(files);
      if (lost > 0) {
        return {
          status: "failed",
          message: `${lost} file${lost === 1 ? " is" : "s are"} no longer attached to this draft. Remove ${
            lost === 1 ? "it" : "them"
          } on the Evidence step and attach ${lost === 1 ? "it" : "them"} again.`,
        };
      }
      if (requeued > 0) return { status: "reupload", count: requeued };

      // 4. File. Safe to repeat.
      const receipt = await reportsApi.file(saved);
      return { status: "filed", receipt };
    },
    [apply, fileExisting, pushDraft, reconcileFiles, writeLocal],
  );

  const fileReport = useCallback((): Promise<FileOutcome> => {
    if (filingRef.current) return filingRef.current;
    const run = (async (): Promise<FileOutcome> => {
      setFiling(true);
      setFileError(null);
      cancelScheduledSave();
      const generation = generationRef.current;
      try {
        await writeLocal(true);
        const outcome = await enqueueServer(() => fileOnServer(generation));
        if (outcome.status === "filed") {
          // The draft is consumed server-side; clear the local copy so the wizard
          // cannot be resumed into a report that already exists.
          reset();
          void queryClient.invalidateQueries({ queryKey: ["feed"] });
          void queryClient.invalidateQueries({ queryKey: ["drafts"] });
        } else if (outcome.status === "failed") {
          setFileError(outcome.message);
        }
        return outcome;
      } catch (err) {
        const message = messageOf(err, "Filing did not finish. Nothing has been filed.");
        setFileError(message);
        return { status: "failed", message };
      } finally {
        setFiling(false);
        filingRef.current = null;
      }
    })();
    filingRef.current = run;
    return run;
  }, [cancelScheduledSave, enqueueServer, fileOnServer, queryClient, reset, writeLocal]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const { attachments, payload, step, draftId } = snapshot;

  const allSealed = useMemo(
    () => attachments.every((item) => item.state === "sealed"),
    [attachments],
  );

  const uploadingCount = useMemo(
    () => attachments.filter((item) => item.state === "uploading" || item.state === "queued").length,
    [attachments],
  );

  const failedCount = useMemo(
    () => attachments.filter((item) => item.state === "failed").length,
    [attachments],
  );

  const hasContent = useMemo(
    () =>
      Boolean(
        payload.category ||
          payload.title?.trim() ||
          payload.body?.trim() ||
          attachments.length > 0,
      ),
    [attachments.length, payload],
  );

  const completedSteps = useMemo(() => completedStepsOf(payload), [payload]);

  return {
    ready,
    draftId,
    step,
    payload,
    attachments,
    savedAt,
    filing,
    fileError,
    hasContent,
    completedSteps,
    setStep,
    patch,
    reset,
    discard,
    saveNow,
    stageServerDraft,
    stagedDraft,
    adoptStagedDraft,
    clearStagedDraft,
    addAttachment,
    removeAttachment,
    retryAttachment,
    retryFailed,
    allSealed,
    uploadingCount,
    failedCount,
    fileReport,
  };
});

export { completedStepsOf, stepIsComplete };
