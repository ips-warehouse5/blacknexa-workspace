/**
 * D4 · Comments, plus D5 empty, D6 loading and D7 error.
 *
 * All four are one screen because they are one screen in the design — the composer
 * is present in every state, and the header count is real text in three of them.
 *
 * The captions, each of which changes the build:
 *
 *   D4: "Support counts sit left of Reply; Flag sends a comment to a moderator.
 *        Two levels only — a reply to a reply joins the same thread. The composer's
 *        anonymity switch inherits your profile default and shows the name it will
 *        publish. Author names are deliberately not links: there is no public profile."
 *   D5: "The sort chips are **gone, not disabled** — nothing to sort. The composer
 *        stays; it is the one action."
 *   D6: "Skeletons mirror the thread geometry, indent included, and fade with depth.
 *        The header count is already known, so it is real text."
 *   D7: "Scoped to the list, so it says the report loaded. The half-written comment
 *        survives and the send button stays live."
 *   D18: "Don't share anyone's private details. 163/500" — the helper and the
 *        counter sit under the composer.
 *
 * D7 is the one most often got wrong: an error here must not blank the report or
 * discard what someone typed.
 *
 * ── Checked before anyone else sees it (docs/INCIDENT_MODULE_PLAN.md §7.5) ──
 * A comment on a public report is checked before it is shown to others —
 * usually in seconds. Its author sees it at once, labelled with its state:
 * "Checking…", then either nothing (it is live), "Held for review" or "Removed
 * by a moderator". After posting, the thread is re-read every 2.5 s — for up to
 * 45 s — until the new comment leaves "Checking…". A new root comment is shown
 * under *Newest*: under *Top* a comment with no likes yet can sit on a page that
 * is not loaded, and the author would lose sight of it while it is checked.
 *
 * While your comment is still being checked, held or removed, nobody else can
 * see it, so it cannot be liked or replied to (the server answers 404). Your own
 * comment offers *Delete* where others' offer *Flag* — the server refuses a flag
 * on your own words anyway (§7.6).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Chip, Switch } from "@/components/ui/Controls";
import { Screen, BackHeader } from "@/components/ui/Screen";
import FlagSheet, { type FlagTarget } from "@/components/sheets/FlagSheet";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import reportsApi, { relativeTime, type CommentView } from "@/lib/api/reports";
import { ownCommentStateLabel, type StatusTone } from "@/lib/report/moderation";
import {
  COMMENT_HELPER,
  COMMENT_MAX_CHARS,
  COMMENT_POLL_INTERVAL_MS,
  clampComment,
  commentActions,
  commentCounter,
  errorInfo,
  findCommentState,
  ownCommentTone,
  shouldPollComment,
  shouldRetryRead,
  type CommentRowActions,
} from "@/lib/report/detail";

type Sort = "top" | "new";

/** The comment just posted, while the screen waits for it to leave "Checking…". */
interface Tracked {
  id: string;
  since: number;
}

function toneInk(tone: StatusTone | null): string {
  switch (tone) {
    case "progress":
      return colors.acc;
    case "attention":
      return colors.warn;
    case "bad":
      return colors.bad2;
    default:
      return colors.t3;
  }
}

export default function CommentsScreen(): React.ReactElement {
  useThemeSync();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();

  const [sort, setSort] = useState<Sort>("top");
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(user?.preferences.anonymousByDefault ?? false);
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null);
  /** Comments flagged from this screen — their Flag reads "Flagged" from then on. */
  const [flaggedIds, setFlaggedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<CommentView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const inputRef = useRef<TextInput>(null);

  /** The report, for the header subtitle and the count. */
  const report = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
    retry: shouldRetryRead,
  });

  const thread = useInfiniteQuery({
    queryKey: ["comments", ref, sort],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => reportsApi.comments(ref!, sort, pageParam),
    enabled: Boolean(ref),
    retry: shouldRetryRead,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Re-read while the comment just posted is still being checked (bounded).
    refetchInterval: (query) => {
      if (!tracked) return false;
      const loaded = query.state.data?.pages.flatMap((page) => page.items) ?? [];
      return shouldPollComment(findCommentState(loaded, tracked.id), Date.now() - tracked.since)
        ? COMMENT_POLL_INTERVAL_MS
        : false;
    },
  });

  const roots = useMemo(
    () => thread.data?.pages.flatMap((page) => page.items) ?? [],
    [thread.data],
  );
  // Known before the list loads, which is why D6's header is real text.
  const total = thread.data?.pages[0]?.total ?? report.data?.commentCount ?? 0;

  const publishedName = anonymous ? "Anonymous" : user?.displayName?.trim() || "Anonymous";

  // Once the comment just posted has a verdict, the report's count may have
  // moved — and there is nothing left to wait for.
  const trackedState = tracked ? findCommentState(roots, tracked.id) : null;
  useEffect(() => {
    if (!tracked || trackedState === null || trackedState === "pending") return;
    setTracked(null);
    void queryClient.invalidateQueries({ queryKey: ["report", ref] });
  }, [queryClient, ref, tracked, trackedState]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !ref || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await reportsApi.createComment(ref, clampComment(body), replyTo?.id, anonymous);
      // Cleared only on success — D7's rule applied to the write path.
      setDraft("");
      setReplyTo(null);
      setTracked({ id: created.id, since: Date.now() });
      if (!created.parentId && sort === "top") {
        // Newest first puts it at the top of the first page — see the file header.
        setSort("new");
      } else {
        await thread.refetch();
      }
      void queryClient.invalidateQueries({ queryKey: ["report", ref] });
    } catch (err) {
      setSendError(errorInfo(err).message ?? "That comment did not send. Try again.");
    } finally {
      setSending(false);
    }
  }, [anonymous, draft, queryClient, ref, replyTo, sending, sort, thread]);

  const like = useCallback(
    async (comment: CommentView) => {
      // Optimistic across both levels.
      queryClient.setQueryData(["comments", ref, sort], (old: typeof thread.data) => {
        if (!old) return old;
        const patch = (row: CommentView): CommentView =>
          row.id === comment.id
            ? { ...row, liked: !row.liked, likeCount: row.likeCount + (row.liked ? -1 : 1) }
            : { ...row, replies: row.replies?.map(patch) };
        return { ...old, pages: old.pages.map((page) => ({ ...page, items: page.items.map(patch) })) };
      });
      await reportsApi.likeComment(comment.id).catch(() => {
        void thread.refetch();
      });
    },
    [queryClient, ref, sort, thread],
  );

  const startReply = useCallback((comment: CommentView) => {
    // Two levels only: replying to a reply targets its root, which is what D4
    // means by "joins the same thread".
    setReplyTo(comment);
    inputRef.current?.focus();
  }, []);

  const markFlagged = useCallback((id: string) => {
    setFlaggedIds((previous) => new Set(previous).add(id));
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await reportsApi.removeComment(deleteTarget.id);
      if (replyTo?.id === deleteTarget.id) setReplyTo(null);
      if (tracked?.id === deleteTarget.id) setTracked(null);
      setDeleteTarget(null);
      showSnackbar({ message: "Comment removed.", type: "success" });
      await thread.refetch();
      void queryClient.invalidateQueries({ queryKey: ["report", ref] });
    } catch (err) {
      setDeleteTarget(null);
      showSnackbar({
        message: errorInfo(err).message ?? "That comment was not removed. Try again.",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, queryClient, ref, replyTo, showSnackbar, thread, tracked]);

  const showSort = roots.length > 0 || thread.isLoading;
  const threadGone = errorInfo(thread.error).status === 404;
  const trimmedLength = draft.trim().length;

  return (
    <Screen padding={0} testID="comments">
      <View style={{ paddingHorizontal: 18 }}>
        <BackHeader
          onBack={() => router.back()}
          padding={0}
          border
          title={undefined}
          right={<View style={{ width: 22 }} />}
        />
        <View style={styles.headerText}>
          <Text variant="label" color={colors.t0} style={{ fontSize: 15 }}>
            {total > 0 ? `${total} comment${total === 1 ? "" : "s"}` : "Comments"}
          </Text>
          <Text variant="metaSm" color={colors.t4} numberOfLines={1} style={{ marginTop: 2 }}>
            {report.data?.title ?? ""}
          </Text>
        </View>
      </View>

      {/* Gone, not disabled, when there is nothing to sort. */}
      {showSort ? (
        <View style={styles.sortRow}>
          <Chip label="Top" height={30} selected={sort === "top"} onPress={() => setSort("top")} />
          <Chip label="Newest" height={30} selected={sort === "new"} onPress={() => setSort("new")} />
        </View>
      ) : null}

      {thread.isLoading ? (
        <ThreadSkeleton />
      ) : thread.isError ? (
        /* D7 — scoped to the list. A 404 means the report itself went away. */
        <View style={styles.centre}>
          <View style={[styles.mark, { backgroundColor: alpha(colors.bad, 0.1) }]}>
            <View style={[styles.markRing, { borderColor: colors.bad2 }]} />
          </View>
          <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 20 }}>
            {threadGone ? "That report is not available" : "Couldn’t load the comments"}
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            {threadGone
              ? "It may have been removed, or it may not be public."
              : "The report itself loaded fine. This isn’t you."}
          </Text>
          <Button
            label="Try again"
            onPress={() => void thread.refetch()}
            loading={thread.isFetching}
            block={false}
            style={{ marginTop: 20, paddingHorizontal: 22 }}
            testID="comments-retry"
          />
          <Text variant="metaSm" color={colors.t5} center style={{ marginTop: 14 }}>
            Anything you had typed is still in the box.
          </Text>
        </View>
      ) : roots.length === 0 ? (
        /* D5 */
        <View style={styles.centre}>
          <View style={[styles.mark, { backgroundColor: colors.s3 }]}>
            <View style={[styles.markRing, { borderColor: colors.t3 }]} />
          </View>
          <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 20 }}>
            No comments yet
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            Be the first to say something. A person who reads a reply here often
            files their own report next.
          </Text>
        </View>
      ) : (
        <FlatList
          data={roots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={[styles.threadBlock, { borderBottomColor: alpha(colors.t0, 0.06) }]}>
              <CommentRow
                comment={item}
                actions={commentActions(item)}
                flagged={flaggedIds.has(item.id)}
                onLike={like}
                onReply={startReply}
                onFlag={(id) => setFlagTarget({ kind: "comment", id })}
                onDelete={setDeleteTarget}
              />
              {item.replies?.map((reply) => (
                <View key={reply.id} style={[styles.replyWrap, { borderLeftColor: alpha(colors.t0, 0.09) }]}>
                  <CommentRow
                    comment={reply}
                    compact
                    // A reply is answerable only while its thread's root is.
                    actions={{
                      ...commentActions(reply),
                      reply: commentActions(reply).reply && commentActions(item).reply,
                    }}
                    flagged={flaggedIds.has(reply.id)}
                    onLike={like}
                    // A reply's Reply targets its root — two levels only.
                    onReply={() => startReply(item)}
                    onFlag={(id) => setFlagTarget({ kind: "comment", id })}
                    onDelete={setDeleteTarget}
                  />
                </View>
              ))}
            </View>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (thread.hasNextPage && !thread.isFetchingNextPage) void thread.fetchNextPage();
          }}
          ListFooterComponent={
            thread.hasNextPage ? (
              <Pressable
                onPress={() => void thread.fetchNextPage()}
                style={[styles.loadMore, { backgroundColor: colors.s3 }]}
                accessibilityRole="button"
                testID="comments-load-more"
              >
                <Text variant="label" color={colors.t1}>
                  {thread.isFetchingNextPage ? "Loading…" : "Load more comments"}
                </Text>
              </Pressable>
            ) : null
          }
        />
      )}

      {/* The composer, present in every state. */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.s0,
              borderTopColor: alpha(colors.t0, 0.08),
              paddingBottom: Math.max(insets.bottom, 12) + 10,
            },
          ]}
        >
          {replyTo ? (
            <View style={[styles.replyBanner, { backgroundColor: colors.s3 }]}>
              <Text variant="metaSm" color={colors.t2} numberOfLines={1} style={{ flex: 1 }}>
                {`Replying to ${replyTo.author.name}`}
              </Text>
              <Pressable
                onPress={() => setReplyTo(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cancel the reply"
              >
                <Text variant="metaSm" color={colors.acc}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Shows the name it will publish, not just an on/off. */}
          <View style={styles.anonRow}>
            <Text variant="labelSm" color={colors.t1}>
              Comment as{" "}
              <Text variant="label" color={colors.t0}>
                {publishedName}
              </Text>
            </Text>
            <Switch
              value={anonymous}
              onValueChange={setAnonymous}
              accessibilityLabel="Comment anonymously"
              testID="comment-anonymous"
            />
          </View>

          {sendError ? (
            <Text
              variant="metaSm"
              color={colors.bad2}
              style={{ marginBottom: 8 }}
              accessibilityLiveRegion="polite"
              testID="comment-send-error"
            >
              {sendError}
            </Text>
          ) : null}

          <View style={styles.composerRow}>
            <TextField
              ref={inputRef}
              value={draft}
              onChangeText={(value) => setDraft(clampComment(value))}
              maxLength={COMMENT_MAX_CHARS}
              placeholder={replyTo ? "Write your reply" : "Add a comment"}
              multiline
              // Grows to about five lines, then scrolls internally.
              multilineHeight={draft.length > 120 ? 108 : 44}
              containerStyle={{ flex: 1 }}
              testID="comment-input"
            />
            <Pressable
              onPress={send}
              disabled={sending || trimmedLength === 0}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              accessibilityState={{ disabled: sending || trimmedLength === 0, busy: sending }}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: trimmedLength > 0 ? colors.acc : colors.s6 },
                pressed && { opacity: 0.85 },
              ]}
              testID="send-comment"
            >
              <SendGlyph active={trimmedLength > 0} />
            </Pressable>
          </View>

          {/* D18: the helper, then the counter. */}
          <View style={styles.helperRow}>
            <Text variant="metaSm" color={colors.t4} style={{ flex: 1 }}>
              {COMMENT_HELPER}
            </Text>
            <Text
              variant="metaSm"
              color={draft.length >= COMMENT_MAX_CHARS ? colors.warn : colors.t4}
              testID="comment-counter"
            >
              {commentCounter(draft)}
            </Text>
          </View>
        </View>
      </KeyboardStickyView>

      {flagTarget ? (
        <FlagSheet
          visible
          target={flagTarget}
          onFlagged={() => markFlagged(flagTarget.id)}
          onClose={() => setFlagTarget(null)}
        />
      ) : null}

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this comment?"
        body="It is removed for everyone, and this can't be undone."
        confirmLabel="Delete comment"
        cancelLabel="Keep it"
        busy={deleting}
        onConfirm={confirmRemove}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}

/** One comment, at either level. */
function CommentRow({
  comment,
  compact = false,
  actions,
  flagged,
  onLike,
  onReply,
  onFlag,
  onDelete,
}: {
  comment: CommentView;
  compact?: boolean;
  actions: CommentRowActions;
  flagged: boolean;
  onLike: (comment: CommentView) => void;
  onReply: (comment: CommentView) => void;
  onFlag: (id: string) => void;
  onDelete: (comment: CommentView) => void;
}): React.ReactElement {
  // The author's own state — never sent for anyone else's comment.
  const stateLabel = comment.isMine ? ownCommentStateLabel(comment.moderationState) : null;
  const stateTone = comment.isMine ? ownCommentTone(comment.moderationState) : null;
  const removed = comment.isMine === true && comment.moderationState === "rejected";

  return (
    <View style={styles.commentRow} testID={`comment-${comment.id}`}>
      {/* A View, not a Pressable: there is no public profile to open. */}
      <View
        style={[
          styles.avatar,
          { backgroundColor: colors.s6 },
          compact && { width: 28, height: 28, borderRadius: 9 },
        ]}
      >
        {comment.author.initials ? (
          <Text variant="labelSm" color={colors.acc} style={{ fontSize: compact ? 10 : 11.5 }}>
            {comment.author.initials}
          </Text>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.commentHead}>
          <Text variant="label" color={colors.t0} style={{ fontSize: 13 }}>
            {comment.author.name}
          </Text>
          <Text variant="metaSm" color={colors.t4}>
            {relativeTime(comment.createdAt)}
          </Text>
        </View>

        <Text
          variant="bodySm"
          color={removed ? colors.t4 : colors.t1}
          style={{ marginTop: 5, lineHeight: 21 }}
        >
          {comment.body}
        </Text>

        {stateLabel ? (
          <Text
            variant="labelSm"
            color={toneInk(stateTone)}
            style={{ marginTop: 6 }}
            accessibilityLiveRegion="polite"
            testID={`comment-state-${comment.id}`}
          >
            {stateLabel}
          </Text>
        ) : null}

        <View style={styles.commentActions}>
          {actions.like ? (
            <Pressable
              onPress={() => onLike(comment)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={comment.liked ? "Remove your like" : "Like this comment"}
              style={styles.actionItem}
            >
              <Text variant="labelSm" color={comment.liked ? colors.acc : colors.t3}>
                {comment.likeCount > 0 ? `♥ ${comment.likeCount}` : "♥"}
              </Text>
            </Pressable>
          ) : null}

          {actions.reply ? (
            <Pressable
              onPress={() => onReply(comment)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${comment.author.name}`}
            >
              <Text variant="labelSm" color={colors.t3}>
                Reply
              </Text>
            </Pressable>
          ) : null}

          {actions.flag ? (
            <Pressable
              onPress={() => onFlag(comment.id)}
              disabled={flagged}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={flagged ? "You flagged this comment" : "Flag this comment"}
              accessibilityState={{ disabled: flagged }}
              style={{ marginLeft: "auto" }}
              testID={`comment-flag-${comment.id}`}
            >
              <Text variant="labelSm" color={flagged ? colors.bad2 : colors.t5}>
                {flagged ? "Flagged" : "Flag"}
              </Text>
            </Pressable>
          ) : null}

          {actions.remove ? (
            <Pressable
              onPress={() => onDelete(comment)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Delete your comment"
              style={{ marginLeft: "auto" }}
              testID={`comment-delete-${comment.id}`}
            >
              <Text variant="labelSm" color={colors.t4}>
                Delete
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** D6 — skeletons that mirror the thread geometry, indent included. */
function ThreadSkeleton(): React.ReactElement {
  return (
    <View style={styles.list} accessibilityLabel="Loading comments">
      {[
        { indent: false, opacity: 1 },
        { indent: true, opacity: 0.8 },
        { indent: false, opacity: 0.65 },
        { indent: false, opacity: 0.4 },
      ].map((row, index) => (
        <View
          key={index}
          style={[
            styles.commentRow,
            { opacity: row.opacity, paddingVertical: 14 },
            row.indent && [styles.replyWrap, { borderLeftColor: alpha(colors.t0, 0.09) }],
          ]}
        >
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.s6 },
              row.indent && { width: 28, height: 28, borderRadius: 9 },
            ]}
          />
          <View style={{ flex: 1 }}>
            <View style={[styles.bar, { backgroundColor: colors.s5, width: 110, height: 11 }]} />
            <View style={[styles.bar, { backgroundColor: colors.s5, width: "100%", height: 12, marginTop: 10 }]} />
            {!row.indent ? (
              <View style={[styles.bar, { backgroundColor: colors.s5, width: "72%", height: 12, marginTop: 6 }]} />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function SendGlyph({ active }: { active: boolean }): React.ReactElement {
  const tint = active ? colors.onAcc : colors.t3;
  return (
    <View style={{ width: 19, height: 19, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 13,
          height: 13,
          borderTopWidth: 1.8,
          borderRightWidth: 1.8,
          borderColor: tint,
          transform: [{ rotate: "-45deg" }, { translateX: -1 }, { translateY: 1 }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerText: { paddingBottom: 12, marginTop: -34, marginLeft: 36 },
  sortRow: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingVertical: 11 },
  list: { paddingHorizontal: 18, paddingBottom: 24 },

  threadBlock: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentRow: { flexDirection: "row", gap: 11 },
  replyWrap: {
    marginTop: 14,
    marginLeft: 45,
    paddingLeft: 14,
    borderLeftWidth: 2,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 9 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  loadMore: {
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: screenPadding.feed,
    paddingTop: 12,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 11,
    marginBottom: 10,
  },
  anonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 10,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  helperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 2,
    paddingTop: 8,
    paddingRight: 53,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },

  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 44,
    paddingBottom: 40,
  },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  markRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.7 },
  bar: { borderRadius: 5 },
});
