/**
 * D4 · Comments, plus D5 empty, D6 loading and D7 error.
 *
 * All four are one screen because they are one screen in the design — the composer
 * is present in every state, and the header count is real text in three of them.
 *
 * The captions, each of which changes the build:
 *
 *   D4: "Two levels only — a reply to a reply joins the same thread. The composer's
 *        anonymity switch inherits your profile default and shows the name it will
 *        publish. Author names are deliberately not links: there is no public profile."
 *   D5: "The sort chips are **gone, not disabled** — nothing to sort. The composer
 *        stays; it is the one action."
 *   D6: "Skeletons mirror the thread geometry, indent included, and fade with depth.
 *        The header count is already known, so it is real text."
 *   D7: "Scoped to the list, so it says the report loaded. The half-written comment
 *        survives and the send button stays live."
 *
 * D7 is the one most often got wrong: an error here must not blank the report or
 * discard what someone typed.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { Chip, Switch } from "@/components/ui/Controls";
import { Screen, BackHeader } from "@/components/ui/Screen";
import FlagSheet, { type FlagTarget } from "@/components/sheets/FlagSheet";
import { useAuth } from "@/providers/AuthProvider";
import reportsApi, { relativeTime, type CommentView } from "@/lib/api/reports";

type Sort = "top" | "new";

export default function CommentsScreen(): React.ReactElement {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [sort, setSort] = useState<Sort>("top");
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(user?.preferences.anonymousByDefault ?? false);
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null);
  const inputRef = useRef<TextInput>(null);

  /** The report, for the header subtitle and the count. */
  const report = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
  });

  const thread = useInfiniteQuery({
    queryKey: ["comments", ref, sort],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => reportsApi.comments(ref!, sort, pageParam),
    enabled: Boolean(ref),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const roots = useMemo(
    () => thread.data?.pages.flatMap((page) => page.items) ?? [],
    [thread.data],
  );
  // Known before the list loads, which is why D6's header is real text.
  const total = thread.data?.pages[0]?.total ?? report.data?.commentCount ?? 0;

  const publishedName = anonymous ? "Anonymous" : user?.displayName?.trim() || "Anonymous";

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !ref) return;
    setSending(true);
    setSendError(null);
    try {
      await reportsApi.createComment(ref, body, replyTo?.id, anonymous);
      // Cleared only on success — D7's rule applied to the write path.
      setDraft("");
      setReplyTo(null);
      await thread.refetch();
      void queryClient.invalidateQueries({ queryKey: ["report", ref] });
    } catch (err) {
      setSendError(
        err instanceof Error && err.message ? err.message : "That comment did not send.",
      );
    } finally {
      setSending(false);
    }
  }, [anonymous, draft, queryClient, ref, replyTo, thread]);

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

  const showSort = roots.length > 0 || thread.isLoading;

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
        /* D7 — scoped to the list. */
        <View style={styles.centre}>
          <View style={[styles.mark, { backgroundColor: alpha(colors.bad, 0.1) }]}>
            <View style={[styles.markRing, { borderColor: colors.bad2 }]} />
          </View>
          <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 20 }}>
            Couldn&rsquo;t load the comments
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            The report itself loaded fine. This isn&rsquo;t you.
          </Text>
          <Button
            label="Try again"
            onPress={() => void thread.refetch()}
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
          <View style={styles.mark}>
            <View style={styles.markRing} />
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
            <View style={styles.threadBlock}>
              <CommentRow
                comment={item}
                onLike={like}
                onReply={startReply}
                onFlag={(id) => setFlagTarget({ kind: "comment", id })}
              />
              {item.replies?.map((reply) => (
                <View key={reply.id} style={styles.replyWrap}>
                  <CommentRow
                    comment={reply}
                    compact
                    onLike={like}
                    // A reply's Reply targets its root — two levels only.
                    onReply={() => startReply(item)}
                    onFlag={(id) => setFlagTarget({ kind: "comment", id })}
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
                style={styles.loadMore}
                accessibilityRole="button"
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
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
          {replyTo ? (
            <View style={styles.replyBanner}>
              <Text variant="metaSm" color={colors.t2} numberOfLines={1} style={{ flex: 1 }}>
                {`Replying to ${replyTo.author.name}`}
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityRole="button">
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
            <Text variant="metaSm" color={colors.bad2} style={{ marginBottom: 8 }}>
              {sendError}
            </Text>
          ) : null}

          <View style={styles.composerRow}>
            <TextField
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment"
              multiline
              // Grows to about five lines, then scrolls internally.
              multilineHeight={draft.length > 120 ? 108 : 44}
              containerStyle={{ flex: 1 }}
              testID="comment-input"
            />
            <Pressable
              onPress={send}
              disabled={sending || draft.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              style={({ pressed }) => [
                styles.sendButton,
                draft.trim().length > 0 && { backgroundColor: colors.acc },
                pressed && { opacity: 0.85 },
              ]}
              testID="send-comment"
            >
              <SendGlyph active={draft.trim().length > 0} />
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>

      {flagTarget ? (
        <FlagSheet
          visible
          target={flagTarget}
          onClose={() => setFlagTarget(null)}
        />
      ) : null}
    </Screen>
  );
}

/** One comment, at either level. */
function CommentRow({
  comment,
  compact = false,
  onLike,
  onReply,
  onFlag,
}: {
  comment: CommentView;
  compact?: boolean;
  onLike: (comment: CommentView) => void;
  onReply: (comment: CommentView) => void;
  onFlag: (id: string) => void;
}): React.ReactElement {
  return (
    <View style={styles.commentRow}>
      {/* A View, not a Pressable: there is no public profile to open. */}
      <View style={[styles.avatar, compact && { width: 28, height: 28, borderRadius: 9 }]}>
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

        <Text variant="bodySm" color={colors.t1} style={{ marginTop: 5, lineHeight: 21 }}>
          {comment.body}
        </Text>

        <View style={styles.commentActions}>
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

          <Pressable onPress={() => onReply(comment)} hitSlop={8} accessibilityRole="button">
            <Text variant="labelSm" color={colors.t3}>
              Reply
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onFlag(comment.id)}
            hitSlop={8}
            accessibilityRole="button"
            style={{ marginLeft: "auto" }}
          >
            <Text variant="labelSm" color={colors.t5}>
              Report
            </Text>
          </Pressable>
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
            row.indent && styles.replyWrap,
          ]}
        >
          <View style={[styles.avatar, row.indent && { width: 28, height: 28, borderRadius: 9 }]} />
          <View style={{ flex: 1 }}>
            <View style={[styles.bar, { width: 110, height: 11 }]} />
            <View style={[styles.bar, { width: "100%", height: 12, marginTop: 10 }]} />
            {!row.indent ? (
              <View style={[styles.bar, { width: "72%", height: 12, marginTop: 6 }]} />
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
    borderBottomColor: alpha(colors.t0, 0.06),
  },
  commentRow: { flexDirection: "row", gap: 11 },
  replyWrap: {
    marginTop: 14,
    marginLeft: 45,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: alpha(colors.t0, 0.09),
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.s6,
    alignItems: "center",
    justifyContent: "center",
  },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 9 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  loadMore: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.s3,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  composer: {
    backgroundColor: colors.s0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(colors.t0, 0.08),
    paddingHorizontal: screenPadding.feed,
    paddingTop: 12,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.s3,
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
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.s6,
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
    backgroundColor: colors.s3,
    alignItems: "center",
    justifyContent: "center",
  },
  markRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.7, borderColor: colors.t3 },
  bar: { backgroundColor: colors.s5, borderRadius: 5 },
});
