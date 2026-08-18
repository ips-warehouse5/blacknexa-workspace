/**
 * TippingDashboard — displays the current user's creator balance from the
 * BlackNexa™ Global Creator Tipping & Seed Drop Engine ledger.
 *
 * Auto-registers the user as a creator on first load (if not already), then
 * fetches the balance summary: available, pending, total received, and tip count.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Coins, RefreshCw, TrendingUp, Wallet } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";

const FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ?? "";

/** Balance shape returned by GET /platform/tipping/creator/:id/balance */
type CreatorBalance = {
  creatorId: string;
  availableUsd: number;
  pendingUsd: number;
  totalReceivedUsd: number;
  totalTips: number;
  currency: string;
};

/** Creator profile returned by the register / get endpoints */
type CreatorProfile = {
  id: string;
  userId: string;
  displayName: string;
  handle: string;
  bio: string;
  defaultCurrency: string;
  verified: boolean;
  createdAt: string;
};

/** Payout shape returned by POST /platform/tipping/payout/request */
type Payout = {
  id: string;
  creatorId: string;
  amountUsd: number;
  payoutFeeUsd: number;
  netAmountUsd: number;
  destination: string;
  status: string;
  createdAt: string;
};

/** Derive the creator ID from the auth user ID. */
function creatorIdFor(userId: string): string {
  return `creator_${userId}`;
}

/** Format USD cents into a display string. */
function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Derive a handle from display name or user ID. */
function deriveHandle(displayName: string, userId: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
  return base.length >= 3 ? base : `creator_${userId.slice(0, 8)}`;
}

export default function TippingDashboard(): React.ReactElement | null {
  const { user } = useAuth();
  const { settings } = useSettings();
  const qc = useQueryClient();

  const creatorId = user ? creatorIdFor(user.id) : "";

  // ── Register creator (auto-creates if not found) ────────────────────────
  const registerMutation = useMutation({
    mutationFn: async (): Promise<CreatorProfile> => {
      if (!user) throw new Error("Not authenticated");
      const res = await fetch(
        `${FUNCTIONS_URL}/api/v1/platform/tipping/creator/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            displayName: settings.displayName || user.name || user.email,
            handle: deriveHandle(settings.displayName || user.name || "", user.id),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Register failed (${res.status})`);
      }
      const json = (await res.json()) as { creator: CreatorProfile };
      return json.creator;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tipping-balance", creatorId] });
    },
  });

  // ── Fetch balance ────────────────────────────────────────────────────────
  const balanceQuery = useQuery<CreatorBalance | null>({
    queryKey: ["tipping-balance", creatorId],
    queryFn: async (): Promise<CreatorBalance | null> => {
      if (!creatorId) return null;
      const res = await fetch(
        `${FUNCTIONS_URL}/api/v1/platform/tipping/creator/${encodeURIComponent(creatorId)}/balance`,
      );
      if (res.status === 404) {
        // Creator not registered yet — trigger registration.
        throw new Error("CREATOR_NOT_FOUND");
      }
      if (!res.ok) {
        throw new Error(`Balance fetch failed (${res.status})`);
      }
      const json = (await res.json()) as { balance: CreatorBalance };
      return json.balance;
    },
    enabled: !!creatorId && !!FUNCTIONS_URL,
    retry: 1,
    staleTime: 15_000,
  });

  // Auto-register when we get a 404.
  useEffect(() => {
    if (
      balanceQuery.error?.message === "CREATOR_NOT_FOUND" &&
      !registerMutation.isPending &&
      !registerMutation.isSuccess
    ) {
      registerMutation.mutate();
    }
  }, [balanceQuery.error, registerMutation]);

  // ── Withdraw (payout request) ───────────────────────────────────────────
  const [payoutMessage, setPayoutMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const withdrawMutation = useMutation({
    mutationFn: async (): Promise<Payout> => {
      if (!creatorId) throw new Error("Not authenticated");
      const idempotencyKey = `wd_${creatorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch(
        `${FUNCTIONS_URL}/api/v1/platform/tipping/payout/request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            creatorId,
            destination: "stripe",
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Withdraw failed (${res.status})`,
        );
      }
      const json = (await res.json()) as { payout: Payout };
      return json.payout;
    },
    onSuccess: (payout) => {
      setPayoutMessage({
        type: "success",
        text: `Withdrawal of ${formatUsd(payout.netAmountUsd)} requested! Funds will arrive via ${payout.destination}.`,
      });
      void qc.invalidateQueries({ queryKey: ["tipping-balance", creatorId] });
    },
    onError: (err: Error) => {
      setPayoutMessage({
        type: "error",
        text: err.message || "Withdrawal failed. Please try again.",
      });
    },
  });

  // Auto-clear payout messages after 6 seconds.
  useEffect(() => {
    if (!payoutMessage) return;
    const timer = setTimeout(() => setPayoutMessage(null), 6_000);
    return () => clearTimeout(timer);
  }, [payoutMessage]);

  // Don't render if no auth user or no functions URL configured.
  if (!user || !FUNCTIONS_URL) return null;

  const balance = balanceQuery.data ?? null;
  const isLoading =
    balanceQuery.isLoading || registerMutation.isPending;
  const isError =
    balanceQuery.isError &&
    balanceQuery.error?.message !== "CREATOR_NOT_FOUND";
  const canWithdraw =
    !!balance && balance.availableUsd > 0 && !withdrawMutation.isPending;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Wallet size={18} color={Colors.gold} />
          <Text style={styles.headerTitle}>Creator Balance</Text>
        </View>
        <Pressable
          onPress={() => balanceQuery.refetch()}
          style={styles.refreshBtn}
          hitSlop={8}
          accessibilityLabel="Refresh balance"
        >
          <RefreshCw size={15} color={Colors.textDim} />
        </Pressable>
      </View>

      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.gold} />
          <Text style={styles.loadingText}>
            {registerMutation.isPending ? "Setting up your ledger…" : "Loading balance…"}
          </Text>
        </View>
      )}

      {isError && !isLoading && (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>
            Could not load your balance. Tap refresh to try again.
          </Text>
        </View>
      )}

      {balance && !isLoading && (
        <>
          <View style={styles.balanceHero}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceAmount}>{formatUsd(balance.availableUsd)}</Text>
            <View style={styles.currencyBadge}>
              <Coins size={11} color={Colors.gold} />
              <Text style={styles.currencyText}>{balance.currency}</Text>
            </View>
          </View>

          <View style={styles.balanceBreakdown}>
            <BalanceStat
              icon={<TrendingUp size={14} color={Colors.emerald} />}
              label="Pending"
              value={formatUsd(balance.pendingUsd)}
            />
            <View style={styles.hsep} />
            <BalanceStat
              icon={<Coins size={14} color={Colors.gold} />}
              label="Total Received"
              value={formatUsd(balance.totalReceivedUsd)}
            />
            <View style={styles.hsep} />
            <BalanceStat
              icon={<Wallet size={14} color={Colors.sky} />}
              label="Total Tips"
              value={balance.totalTips.toString()}
            />
          </View>

          {/* ── Withdraw button ─────────────────────────────────────────── */}
          <Pressable
            onPress={() => withdrawMutation.mutate()}
            disabled={!canWithdraw}
            style={({ pressed }) => [
              styles.withdrawBtn,
              !canWithdraw && styles.withdrawBtnDisabled,
              pressed && canWithdraw && styles.withdrawBtnPressed,
            ]}
            accessibilityLabel="Withdraw available balance"
            accessibilityRole="button"
          >
            {withdrawMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.surface} />
            ) : (
              <>
                <ArrowDownToLine size={16} color={canWithdraw ? Colors.surface : Colors.textMute} />
                <Text
                  style={[
                    styles.withdrawBtnText,
                    !canWithdraw && styles.withdrawBtnTextDisabled,
                  ]}
                >
                  Withdraw {balance.availableUsd > 0 ? formatUsd(balance.availableUsd) : ""}
                </Text>
              </>
            )}
          </Pressable>

          {/* ── Payout feedback ───────────────────────────────────────────── */}
          {payoutMessage && (
            <View
              style={[
                styles.payoutMsgRow,
                payoutMessage.type === "success"
                  ? styles.payoutMsgSuccess
                  : styles.payoutMsgError,
              ]}
            >
              <Text
                style={
                  payoutMessage.type === "success"
                    ? styles.payoutMsgTextSuccess
                    : styles.payoutMsgTextError
                }
              >
                {payoutMessage.text}
              </Text>
            </View>
          )}

          <Text style={styles.footerNote}>
            Powered by the BlackNexa™ Seed Drop Engine · Platform fee 8% · Withdrawal fee $0.25
          </Text>
        </>
      )}
    </View>
  );
}

function BalanceStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statBox}>
      <View style={styles.statIconRow}>
        {icon}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: "hidden",
    marginVertical: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textDim,
    fontWeight: "500",
  },
  errorRow: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 13,
    color: Colors.crimson,
    fontWeight: "500",
  },
  balanceHero: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface2,
    marginHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMute,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: "900",
    color: Colors.gold,
    letterSpacing: -1,
    marginBottom: 8,
  },
  currencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  currencyText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  balanceBreakdown: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textMute,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  hsep: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  withdrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.gold,
  },
  withdrawBtnDisabled: {
    backgroundColor: Colors.surface3,
  },
  withdrawBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  withdrawBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.surface,
    letterSpacing: 0.3,
  },
  withdrawBtnTextDisabled: {
    color: Colors.textMute,
  },
  payoutMsgRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  payoutMsgSuccess: {
    backgroundColor: "rgba(79, 178, 134, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(79, 178, 134, 0.3)",
  },
  payoutMsgError: {
    backgroundColor: "rgba(224, 102, 102, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(224, 102, 102, 0.3)",
  },
  payoutMsgTextSuccess: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.emerald,
    lineHeight: 17,
  },
  payoutMsgTextError: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.crimson,
    lineHeight: 17,
  },
  footerNote: {
    fontSize: 10,
    color: Colors.textMute,
    textAlign: "center",
    fontWeight: "500",
    paddingBottom: 14,
    paddingHorizontal: 16,
    letterSpacing: 0.3,
  },
});
