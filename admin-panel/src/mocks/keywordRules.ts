/**
 * Keyword rules that feed the automated flagging.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { KeywordRule } from "@/mocks/types";

export const keywordRules: KeywordRule[] = [
  {
    title: "Direct Threat & Violence",
    type: "System Policy",
    source: "Admin Defined",
    pattern: "threat, kill, assault, come down to station",
    detected: 2,
  },
  {
    title: "Harassment & Bullying",
    type: "System Policy",
    source: "Admin Defined",
    pattern: "harass, find a reason, repeatedly followed",
    detected: 3,
  },
  {
    title: "Hate Speech & Discrimination",
    type: "System Policy",
    source: "Admin Defined",
    pattern: "racial abuse, slurs, profiling",
    detected: 1,
  },
  {
    title: "Private Details / Doxxing",
    type: "System Policy",
    source: "Admin Defined",
    pattern: "phone number, street address, postal code",
    detected: 1,
  },
  {
    title: "Misleading or Untrue Content",
    type: "System Policy",
    source: "Admin Defined",
    pattern: "fake report, untrue, fabricated",
    detected: 2,
  },
  {
    title: "Spam or Advertising",
    type: "System Policy",
    source: "Admin Defined",
    pattern: "promo link, buy crypto, telegram spam",
    detected: 1,
  },
  {
    title: "handle it ourselves",
    type: "AI Discovered",
    source: "AI Pattern Match",
    pattern: "Vigilante & offline threat language",
    detected: 1,
  },
  {
    title: "find a reason",
    type: "AI Discovered",
    source: "AI Pattern Match",
    pattern: "Retaliatory police intimidation phrasing",
    detected: 1,
  },
  {
    title: "thrown out on the street",
    type: "AI Discovered",
    source: "AI Pattern Match",
    pattern: "Housing harassment & eviction hostility",
    detected: 1,
  },
];

export default keywordRules;
