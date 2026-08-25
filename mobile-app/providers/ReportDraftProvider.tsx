/**
 * The report wizard's state — screens C1 through C11.
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
 */

import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import reportsApi, { type DraftPayload, type EvidenceKind } from "@/lib/api/reports";
import { ApiError } from "@/lib/api/client";
import { hashFile, makeThumbnail, putFile } from "@/lib/evidence-upload";

const STORAGE_KEY = "bn.report_draft.v1";
/** C1–C7 autosave cadence. Long enough not to thrash, short enough to feel live. */
const AUTOSAVE_DEBOUNCE_MS = 400;

/** One attachment, tracked from picker to sealed. */
export interface DraftAttachment {
  /** Local id, stable across the whole lifecycle. */
  localId: string;
  kind: EvidenceKind;
  mime: string;
  /** Local file URI. Held until the upload succeeds — C10's promise. */
  uri: string;
  bytes: number;
  durationMs?: number;
  capturedAt?: string;
  /** Server id, once presigned. */
  evidenceId?: string;
  state: "queued" | "uploading" | "sealed" | "failed";
  /** 0–1, for C5's progress bar. */
  progress: number;
  error?: string;
  sealedAt?: string;
}

interface PersistedDraft {
  draftId?: string;
  step: number;
  payload: DraftPayload;
  attachments: DraftAttachment[];
  savedAt: string;
}

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
  /** C10 — keep it, and make sure the server has it. */
  saveNow: () => Promise<void>;

  addAttachment: (input: Omit<DraftAttachment, "localId" | "state" | "progress">) => void;
  removeAttachment: (localId: string) => Promise<void>;
  retryAttachment: (localId: string) => void;
  /** True once every attachment is sealed — C8 will not file before this. */
  allSealed: boolean;
  uploadingCount: number;

  /** C7 → C8 → C9. Resolves with the case reference. */
  fileReport: () => Promise<{ reportId: string; caseRef: string } | null>;
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

export const [ReportDraftProvider, useReportDraft] = createContextHook<DraftState>(() => {
  const [ready, setReady] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [step, setStepState] = useState(1);
  const [payload, setPayload] = useState<DraftPayload>({});
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against two uploads starting for the same attachment. */
  const uploadingRef = useRef<Set<string>>(new Set());

  // ── Restore ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as PersistedDraft;
          setDraftId(stored.draftId);
          setStepState(stored.step ?? 1);
          setPayload(stored.payload ?? {});
          // An upload interrupted by a kill comes back as queued, not lost — the
          // local URI is still on disk, which is the point of holding it.
          setAttachments(
            (stored.attachments ?? []).map((item) =>
              item.state === "uploading" ? { ...item, state: "queued", progress: 0 } : item,
            ),
          );
          setSavedAt(stored.savedAt ?? null);
        }
      } catch {
        /* a corrupt draft is dropped rather than blocking the wizard */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  /** Write locally, then sync in the background. */
  const persist = useCallback(
    async (next: PersistedDraft, syncToServer: boolean) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      setSavedAt(next.savedAt);

      if (!syncToServer) return;
      try {
        const result = await reportsApi.saveDraft(next.step, next.payload, next.draftId);
        if (!next.draftId) setDraftId(result.draftId);
      } catch {
        // Offline, or the server said no. The local copy stands and the next
        // change will try again — a step must never wait on this.
      }
    },
    [],
  );

  /** Debounced save. Every field change funnels through here. */
  const scheduleSave = useCallback(
    (nextStep: number, nextPayload: DraftPayload, nextAttachments: DraftAttachment[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persist(
          {
            draftId,
            step: nextStep,
            payload: nextPayload,
            attachments: nextAttachments,
            savedAt: new Date().toISOString(),
          },
          true,
        );
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [draftId, persist],
  );

  const patch = useCallback(
    (values: DraftPayload) => {
      setPayload((current) => {
        const next = { ...current, ...values };
        scheduleSave(step, next, attachments);
        return next;
      });
    },
    [attachments, scheduleSave, step],
  );

  const setStep = useCallback(
    (nextStep: number) => {
      setStepState(nextStep);
      scheduleSave(nextStep, payload, attachments);
    },
    [attachments, payload, scheduleSave],
  );

  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDraftId(undefined);
    setStepState(1);
    setPayload({});
    setAttachments([]);
    setSavedAt(null);
    setFileError(null);
    void AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * C11 — discard.
   *
   * The server delete happens first so a partially uploaded object is cleaned up,
   * but a failure there still clears the local copy: the user asked for it gone,
   * and leaving it on their device would be the wrong half to keep.
   */
  const discard = useCallback(async () => {
    if (draftId) await reportsApi.discardDraft(draftId).catch(() => {});
    reset();
  }, [draftId, reset]);

  const saveNow = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await persist(
      { draftId, step, payload, attachments, savedAt: new Date().toISOString() },
      true,
    );
  }, [attachments, draftId, payload, persist, step]);

  // ── Uploads ───────────────────────────────────────────────────────────────

  const updateAttachment = useCallback(
    (localId: string, changes: Partial<DraftAttachment>) => {
      setAttachments((current) => {
        const next = current.map((item) =>
          item.localId === localId ? { ...item, ...changes } : item,
        );
        // Persisted without a server round trip: upload progress is local state,
        // and syncing it would be a request per percent.
        void AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            draftId,
            step,
            payload,
            attachments: next,
            savedAt: new Date().toISOString(),
          }),
        ).catch(() => {});
        return next;
      });
    },
    [draftId, payload, step],
  );

  /**
   * Presign → upload → commit, for one attachment.
   *
   * The SHA-256 is computed from the local file's **raw bytes** before upload, and
   * the server recomputes it from what actually landed. A mismatch is a refusal, not
   * a warning, which is what makes "Sealed" on C5 mean something — and why the hash
   * has to be of the bytes rather than of a base64 rendering of them. See
   * `lib/evidence-upload.ts`.
   *
   * A photo also gets a small preview uploaded to a second presigned slot, so the
   * feed does not download the original to paint a card.
   */
  const runUpload = useCallback(
    async (attachment: DraftAttachment, ensureDraftId: () => Promise<string>) => {
      if (uploadingRef.current.has(attachment.localId)) return;
      uploadingRef.current.add(attachment.localId);
      updateAttachment(attachment.localId, { state: "uploading", progress: 0, error: undefined });

      try {
        const targetDraftId = await ensureDraftId();

        const presign =
          attachment.evidenceId
            ? null
            : await reportsApi.presignEvidence({
                kind: attachment.kind,
                mime: attachment.mime,
                bytes: attachment.bytes,
                durationMs: attachment.durationMs,
                capturedAt: attachment.capturedAt,
                draftId: targetDraftId,
              });

        const evidenceId = attachment.evidenceId ?? presign!.evidenceId;
        if (!attachment.evidenceId) updateAttachment(attachment.localId, { evidenceId });

        if (presign) {
          // `uploadAsync` reports real progress for a large file, which is what C5
          // draws — a fetch with a blob body would jump from 0 to 100.
          const task = FileSystem.createUploadTask(
            presign.uploadUrl,
            attachment.uri,
            {
              httpMethod: "PUT",
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              headers: presign.headers,
            },
            (progress) => {
              const ratio =
                progress.totalBytesExpectedToSend > 0
                  ? progress.totalBytesSent / progress.totalBytesExpectedToSend
                  : 0;
              updateAttachment(attachment.localId, { progress: Math.min(0.99, ratio) });
            },
          );
          const result = await task.uploadAsync();
          if (!result || result.status >= 300) {
            throw new Error(`Upload rejected (${result?.status ?? "no response"})`);
          }
        }

        /*
         * The preview, before the commit. Best-effort throughout: a failure here
         * leaves `thumbUploaded` false and the card falls back to its text-first
         * variant, rather than losing an attachment over a convenience.
         */
        let thumbUploaded = false;
        if (presign?.thumbUploadUrl && attachment.kind === "photo") {
          const thumbUri = await makeThumbnail(attachment.uri);
          if (thumbUri) {
            thumbUploaded = await putFile(
              presign.thumbUploadUrl,
              thumbUri,
              presign.thumbHeaders ?? { "Content-Type": "image/jpeg" },
            );
          }
        }

        // Hash the local bytes; the server hashes what it stored and compares.
        const sha256 = await hashFile(attachment.uri);

        const sealed = await reportsApi.commitEvidence(evidenceId, {
          sha256,
          capturedAt: attachment.capturedAt,
          durationMs: attachment.durationMs,
          thumbUploaded,
        });

        updateAttachment(attachment.localId, {
          state: "sealed",
          progress: 1,
          sealedAt: sealed.sealedAt ?? new Date().toISOString(),
          error: undefined,
        });
      } catch (err) {
        updateAttachment(attachment.localId, {
          state: "failed",
          error:
            err instanceof ApiError
              ? err.message
              : "That file did not finish uploading. Tap to try again.",
        });
      } finally {
        uploadingRef.current.delete(attachment.localId);
      }
    },
    [updateAttachment],
  );

  /**
   * Make sure a server draft exists before presigning against it.
   *
   * Evidence has to belong to something, and the first attachment may arrive
   * before any autosave has round-tripped.
   */
  const ensureDraftId = useCallback(async (): Promise<string> => {
    if (draftId) return draftId;
    const result = await reportsApi.saveDraft(step, payload);
    setDraftId(result.draftId);
    return result.draftId;
  }, [draftId, payload, step]);

  /** Drain the queue whenever something is waiting. */
  useEffect(() => {
    const queued = attachments.filter((item) => item.state === "queued");
    for (const item of queued) void runUpload(item, ensureDraftId);
  }, [attachments, ensureDraftId, runUpload]);

  const addAttachment = useCallback(
    (input: Omit<DraftAttachment, "localId" | "state" | "progress">) => {
      const attachment: DraftAttachment = {
        ...input,
        localId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        state: "queued",
        progress: 0,
      };
      setAttachments((current) => [...current, attachment]);
    },
    [],
  );

  const removeAttachment = useCallback(
    async (localId: string) => {
      const attachment = attachments.find((item) => item.localId === localId);
      if (attachment?.evidenceId) {
        await reportsApi.removeEvidence(attachment.evidenceId).catch(() => {});
      }
      setAttachments((current) => current.filter((item) => item.localId !== localId));
    },
    [attachments],
  );

  const retryAttachment = useCallback(
    (localId: string) => {
      // Back to queued; the drain effect picks it up. The local file is still
      // there, so nothing has to be re-picked — C8's retry promise.
      updateAttachment(localId, { state: "queued", progress: 0, error: undefined });
    },
    [updateAttachment],
  );

  // ── Filing ────────────────────────────────────────────────────────────────

  const allSealed = useMemo(
    () => attachments.every((item) => item.state === "sealed"),
    [attachments],
  );

  const uploadingCount = useMemo(
    () => attachments.filter((item) => item.state === "uploading" || item.state === "queued").length,
    [attachments],
  );

  const fileReport = useCallback(async () => {
    setFiling(true);
    setFileError(null);
    try {
      // Make sure the server has the final payload before it files from it.
      await saveNow();
      const target = draftId ?? (await ensureDraftId());
      const result = await reportsApi.file(target);
      // The draft is consumed server-side; clear the local copy so the wizard
      // cannot be resumed into a report that already exists.
      reset();
      return { reportId: result.reportId, caseRef: result.caseRef };
    } catch (err) {
      setFileError(
        err instanceof ApiError ? err.message : "Filing did not finish. Nothing has been filed.",
      );
      return null;
    } finally {
      setFiling(false);
    }
  }, [draftId, ensureDraftId, reset, saveNow]);

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

  const completedSteps = useMemo(() => {
    let count = 0;
    for (let index = 1; index <= 7; index += 1) {
      if (stepIsComplete(index, payload)) count += 1;
    }
    return count;
  }, [payload]);

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
    addAttachment,
    removeAttachment,
    retryAttachment,
    allSealed,
    uploadingCount,
    fileReport,
  };
});

export { stepIsComplete };
