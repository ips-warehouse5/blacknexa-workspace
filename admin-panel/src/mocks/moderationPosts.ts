/**
 * The moderation queue: incidents, comments and profiles awaiting a decision.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { ModerationPost } from "@/mocks/types";

export const moderationPosts: ModerationPost[] = [
  {
    id: "INC-20481",
    type: "Incident",
    title: "Stopped and searched outside my own building",
    user: "Jason Dilo",
    category: "Policing",
    status: "Public",
    location: "Hackney, London",
    urgent: true,
    submitted: "Aug 27, 2026  09:41 AM",
    content:
      'Third time this month. The officer said I "matched a description" and would not repeat it when I asked twice. I was held against the wall by the entry door for about eleven minutes while neighbours walked past.\n\nI told him I live here and offered my post. He said people like me always say that, and that if I kept talking he would find a reason. I want this on record because the same two officers work this street every week.',
    evidence: ["Image evidence", "Document evidence", "Audio evidence"],
    ai: [
      ["Threatening Content", "threat"],
      ["Harassment", "find a reason"],
    ],
    reports: [],
  },
  {
    id: "CMT-90412",
    type: "Comment",
    title: "Threatening reply in incident discussion thread",
    parentIncident:
      "INC-20481 (Stopped and searched outside my own building)",
    user: "Mark Vance",
    category: "Policing",
    status: "Public",
    location: "Hackney, London",
    urgent: true,
    submitted: "Aug 31, 2026  11:15 AM",
    content:
      "Stop making excuses for these people or we will come down to your station and handle it ourselves.",
    evidence: [],
    ai: [],
    reports: [
      ["Jason Dilo", "Threatening", "Aug 31, 2026  11:20 AM"],
      ["Sarah Miller", "Threatening", "Aug 31, 2026  11:35 AM"],
    ],
  },
  {
    id: "INC-20479",
    type: "Incident",
    title: "Workplace harassment report",
    user: "Sarah Miller",
    category: "Workplace",
    status: "Private",
    location: "London",
    urgent: false,
    submitted: "Aug 31, 2026  09:48 AM",
    content:
      "I am documenting repeated inappropriate conduct at my workplace and would like this incident reviewed by the community.",
    evidence: ["Image evidence"],
    ai: [],
    reports: [
      ["Sarah Miller", "Harassment", "Aug 31, 2026  10:32 AM"],
      ["Alex Wilson", "Untrue", "Aug 31, 2026  10:32 AM"],
    ],
  },
  {
    id: "INC-20475",
    type: "Incident",
    title: "Targeted verbal abuse and slurs at public park",
    user: "Chloe Bennett",
    category: "Abuse",
    status: "Public",
    location: "Manchester, UK",
    urgent: true,
    submitted: "Aug 31, 2026  08:30 AM",
    content:
      "Individual repeatedly hurled targeted racial abuse and profane slurs at park visitors while obstructing the pedestrian footpath.",
    evidence: ["Audio evidence", "Image evidence"],
    ai: [
      ["Abuse", "racial abuse"],
      ["Abuse", "profane slurs"],
    ],
    reports: [],
  },
  {
    id: "CMT-90388",
    type: "Comment",
    title: "Abusive comment on tenant housing thread",
    parentIncident: "INC-20460 (Landlord tenant eviction harassment)",
    user: "Leo Sterling",
    category: "Housing",
    status: "Public",
    location: "Toronto, Canada",
    urgent: false,
    submitted: "Aug 30, 2026  06:10 PM",
    content:
      "You deserve to get thrown out on the street, stop crying online.",
    evidence: [],
    ai: [],
    reports: [
      ["Karan Patel", "Threatening", "Aug 30, 2026  06:15 PM"],
      ["Mia Brown", "Private Details", "Aug 30, 2026  06:22 PM"],
      ["David Brown", "Spam or advertising", "Aug 30, 2026  06:30 PM"],
    ],
  },
  {
    id: "INC-20470",
    type: "Incident",
    title: "Harassment at public venue",
    user: "Priya Shah",
    category: "Harassment",
    status: "Public",
    location: "Birmingham, UK",
    urgent: false,
    submitted: "Aug 30, 2026  05:30 PM",
    content:
      "A harassment incident was reported at a public venue where someone repeatedly followed and shouted.",
    evidence: ["Image evidence"],
    ai: [
      ["Harassment", "harassment"],
      ["Harassment", "repeatedly followed"],
    ],
    reports: [],
  },
  {
    id: "INC-20468",
    type: "Incident",
    title: "Racial profiling near university",
    user: "Rohan Mehta",
    category: "Profiling",
    status: "Private",
    location: "Chicago, US",
    urgent: true,
    submitted: "Aug 30, 2026  03:18 PM",
    content:
      "Security guard stopped and searched me without any valid reason.",
    evidence: ["Video evidence"],
    ai: [],
    reports: [
      ["Nina Patel", "Untrue", "Aug 30, 2026  03:25 PM"],
      ["Arun Verma", "Private Details", "Aug 30, 2026  03:40 PM"],
    ],
  },
  {
    id: "INC-20464",
    type: "Incident",
    title: "Direct verbal threat on school campus",
    user: "Ava Wilson",
    category: "Education",
    status: "Public",
    location: "London, UK",
    urgent: false,
    submitted: "Aug 30, 2026  01:12 PM",
    content:
      "Verbal threats made in broad daylight on school premises, revealing student home address at 12 Maple Street.",
    evidence: ["Image evidence"],
    ai: [
      ["Threatening Content", "threat"],
      ["Privacy Violation", "12 Maple Street"],
    ],
    reports: [],
  },
  {
    id: "INC-20460",
    type: "Incident",
    title: "Landlord tenant eviction harassment",
    user: "Kabir Joshi",
    category: "Housing",
    status: "Public",
    location: "Manchester, UK",
    urgent: false,
    submitted: "Aug 29, 2026  06:45 PM",
    content:
      "Persistent abusive messages sent by landlord demanding illegal eviction.",
    evidence: ["Image evidence"],
    ai: [],
    reports: [
      ["Mia Brown", "Harassment", "Aug 29, 2026  06:52 PM"],
      ["Karan Patel", "Threatening", "Aug 29, 2026  07:10 PM"],
    ],
  },
  {
    id: "INC-20455",
    type: "Incident",
    title: "Violent assault near transit hub",
    user: "Daniel Lee",
    category: "Policing",
    status: "Public",
    location: "New York, US",
    urgent: true,
    submitted: "Aug 29, 2026  04:08 PM",
    content:
      "Report of physical fight and violent assault during stop and search.",
    evidence: ["Image evidence", "Video evidence"],
    ai: [
      ["Violence", "violence"],
      ["Violence", "physical fight"],
    ],
    reports: [],
  },
  {
    id: "INC-20451",
    type: "Incident",
    title: "Bullying and harassment in housing complex",
    user: "Emma Davis",
    category: "Housing",
    status: "Private",
    location: "Vancouver, Canada",
    urgent: false,
    submitted: "Aug 29, 2026  10:14 AM",
    content:
      "Repeated targeted harassment by apartment committee members.",
    evidence: ["Document evidence"],
    ai: [
      ["Harassment", "harassment"],
      ["Harassment", "targeted harassment"],
    ],
    reports: [],
  },
  {
    id: "INC-20449",
    type: "Incident",
    title: "Online abusive slurs in campus group",
    user: "Arjun Rao",
    category: "Education",
    status: "Public",
    location: "Toronto, Canada",
    urgent: false,
    submitted: "Aug 28, 2026  08:02 PM",
    content:
      "Abusive language, slurs, and persistent verbal abuse posted in university discussion board.",
    evidence: ["Image evidence"],
    reports: [],
  },
];

export default moderationPosts;
