/**
 * The moderation queue's category tabs.
 *
 * A post is not filed under a category — it is matched against the reasons
 * people reported it, the rules the AI matched, and its own incident category.
 * The prototype expressed that as a chain of `if (tab === …)` branches; the
 * same rules are expressed here as data, so a tab is a row rather than a branch
 * and adding one does not mean editing a function.
 */

import type { ModerationPost } from "@/mocks/types";

export interface QueueTab {
  /** Label, and the tab's identity. */
  value: string;
  /**
   * Substrings that match a report reason. Compared case-insensitively against
   * the reason text, so "threat" also catches "Threatening".
   */
  reasons?: readonly string[];
  /** Substrings matched against the AI rule name and the text it flagged. */
  ai?: readonly string[];
  /** Exact incident categories, lowercased. */
  categories?: readonly string[];
}

/** Tabs that select by source rather than by subject. */
export const SOURCE_TABS = ["All", "AI Flag Reports", "User Flag Reports"] as const;

export const SUBJECT_TABS: readonly QueueTab[] = [
  {
    value: "Direct Threat & Violence",
    reasons: ["threat", "violence", "assault"],
    ai: ["threat", "violence"],
    categories: ["threat", "violence"],
  },
  {
    value: "Harassment & Bullying",
    reasons: ["harass", "bully"],
    ai: ["harass", "find a reason"],
    categories: ["harassment"],
  },
  {
    value: "Hate Speech & Discrimination",
    reasons: ["abuse", "hate", "slur", "discriminat", "profiling"],
    ai: ["abuse", "slur", "racial"],
    categories: ["abuse", "profiling"],
  },
  {
    value: "Private Details / Doxxing",
    reasons: ["private", "doxx"],
    ai: ["privacy", "street", "address"],
  },
  {
    value: "Misleading or Untrue Content",
    reasons: ["untrue", "mislead", "false"],
    ai: ["untrue", "mislead"],
  },
  {
    value: "Spam or Advertising",
    reasons: ["spam", "advertis"],
    ai: ["spam"],
  },
];

/** Every tab label, in the order the design shows them. */
export const ALL_TABS: string[] = [...SOURCE_TABS, ...SUBJECT_TABS.map((t) => t.value)];

/** Whether a post belongs under a subject tab. */
function matchesSubject(post: ModerationPost, tab: QueueTab): boolean {
  const reasons = post.reports.map(([, reason]) => reason.toLowerCase());
  // The rule name and the matched text are searched together, because the
  // prototype's rules key off both — "find a reason" is matched text, not a rule.
  const aiText = (post.ai ?? []).map(([rule, matched]) => `${rule} ${matched}`.toLowerCase());
  const category = post.category.toLowerCase();

  if (tab.reasons?.some((needle) => reasons.some((r) => r.includes(needle)))) return true;
  if (tab.ai?.some((needle) => aiText.some((a) => a.includes(needle)))) return true;
  if (tab.categories?.includes(category)) return true;
  return false;
}

/** Whether a post belongs under `tabValue`. */
export function matchesTab(post: ModerationPost, tabValue: string): boolean {
  if (tabValue === "All") return true;
  if (tabValue === "AI Flag Reports") return (post.ai?.length ?? 0) > 0;
  if (tabValue === "User Flag Reports") return post.reports.length > 0;

  const tab = SUBJECT_TABS.find((t) => t.value === tabValue);
  return tab ? matchesSubject(post, tab) : false;
}

/** Everything the queue's search box looks at. */
export function searchableFields(post: ModerationPost): string[] {
  return [
    post.title,
    post.user,
    post.id,
    post.category,
    post.location,
    post.content,
    post.parentIncident ?? "",
    // Flattened so a search for a reason or a rule name finds the post that
    // carries it — which is how a moderator actually looks for one.
    ...(post.ai ?? []).map((flag) => flag.join(" ")),
    ...post.reports.map((flag) => flag.join(" ")),
  ];
}

/** How many posts sit under a tab, for the tab's count badge. */
export function countForTab(posts: readonly ModerationPost[], tabValue: string): number {
  return posts.filter((post) => matchesTab(post, tabValue)).length;
}
