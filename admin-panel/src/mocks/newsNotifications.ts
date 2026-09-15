/**
 * News push notifications.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { NewsNotification } from "@/mocks/types";

export const newsNotifications: NewsNotification[] = [
  {
    id: "NOTIF-NWS-01",
    articleId: "NWS-101",
    headline: "Global African Diaspora Investment Summit Announces $50M Tech Fund",
    summary: "Joint early-stage venture fund launched across Lagos, Nairobi, London, and Kingston.",
    targetRegion: "all",
    targetRole: "all",
    targetTier: "all",
    status: "Sent",
    sentAt: "Sep 02, 2026 08:45 AM",
    sentCount: 12500,
    openCount: 6840,
    openRate: "54.7%",
    deepLink: "blacknexa://news/NWS-101",
  },
  {
    id: "NOTIF-NWS-02",
    articleId: "NWS-102",
    headline: "Atlanta City Council Approves Landmark Community Defense & Rights Initiative",
    summary: "Municipal lawmakers pass $14M package for mobile legal assistance and rapid rights documentation.",
    targetRegion: "united_states",
    targetRole: "all",
    targetTier: "all",
    status: "Sent",
    sentAt: "Sep 02, 2026 07:30 AM",
    sentCount: 4850,
    openCount: 3120,
    openRate: "64.3%",
    deepLink: "blacknexa://news/NWS-102",
  },
  {
    id: "NOTIF-NWS-03",
    articleId: "NWS-103",
    headline: "HBCU Engineering Consortium Launches Quantum AI & STEM Fellowship",
    summary: "250 graduate research fellowships announced with leading supercomputing centers.",
    targetRegion: "united_states",
    targetRole: "member",
    targetTier: "paid",
    status: "Sent",
    sentAt: "Sep 01, 2026 10:15 AM",
    sentCount: 2200,
    openCount: 1540,
    openRate: "70.0%",
    deepLink: "blacknexa://news/NWS-103",
  },
];

export default newsNotifications;
