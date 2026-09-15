/**
 * Reported incidents across every status.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { Incident } from "@/mocks/types";

export const incidents: Incident[] = [
  {
    id: "INC-20481",
    title: "Stopped and searched outside my own building",
    author: "Jason Dilo",
    category: "Policing",
    status: "Submitted",
    visibility: "Public",
    location: "Hackney, London",
    submitted: "Aug 27, 2026  09:41 AM",
    story:
      'Third time this month. The officer said I "matched a description" and would not repeat it when I asked twice. I was held against the wall by the entry door for about eleven minutes while neighbours walked past.\n\nI told him I live here and offered my post. He said people like me always say that, and that if I kept talking he would find a reason. I want this on record because the same two officers work this street every week.',
    assignee: "Unassigned",
    evidence: [
      { type: "IMG", name: "entry-door-01.jpg", meta: "Image · 2.4 MB" },
      {
        type: "PDF",
        name: "witness-statement.pdf",
        meta: "Document · 1.8 MB",
      },
      {
        type: "AUD",
        name: "voice-note-21.m4a",
        meta: "Audio · 3:12 · 11 MB",
      },
    ],
    notes: [
      {
        author: "System",
        date: "Aug 27, 2026  09:41 AM",
        text: "Incident submitted by verified user.",
      },
    ],
  },
  {
    id: "INC-20479",
    title: "Workplace discrimination and promotion denial",
    author: "Sarah Miller",
    category: "Workplace",
    status: "Under Review",
    visibility: "Private",
    location: "London",
    submitted: "Aug 26, 2026  02:15 PM",
    story:
      "Documenting systemic exclusion from senior management reviews despite meeting all performance criteria. HR dismissed the internal complaint without investigation.",
    assignee: "Advocate Sarah Miller",
    assignedRole: "Advocate",
    assignedAt: "26 Aug 2026  14:15",
    evidence: [
      {
        type: "PDF",
        name: "hr-complaint-refusal.pdf",
        meta: "Document · 3.1 MB",
      },
      {
        type: "PDF",
        name: "evaluation-scores.pdf",
        meta: "Document · 1.2 MB",
      },
    ],
    notes: [
      {
        author: "Advocate Sarah Miller",
        date: "Aug 26, 2026  04:00 PM",
        text: "Contacted client for employment contract verification.",
      },
    ],
  },
  {
    id: "INC-20472",
    title: "Medical emergency room treatment refusal",
    author: "David Brown",
    category: "Medical",
    status: "Verified",
    visibility: "Public",
    location: "New York",
    submitted: "Aug 25, 2026  11:30 AM",
    story:
      "Hospital triage nurse refused immediate intake and made discriminatory remarks regarding insurance status and race. Treatment delayed by 3 hours.",
    assignee: "Advocate Jason Ross",
    assignedRole: "Advocate",
    assignedAt: "25 Aug 2026  11:45",
    evidence: [
      { type: "IMG", name: "er-wristband.jpg", meta: "Image · 1.9 MB" },
      {
        type: "PDF",
        name: "discharge-summary.pdf",
        meta: "Document · 2.5 MB",
      },
    ],
    notes: [
      {
        author: "Advocate Jason Ross",
        date: "Aug 25, 2026  01:20 PM",
        text: "Hospital records verified. Hospital oversight board contacted.",
      },
      {
        author: "Moderator M. Kaur",
        date: "Aug 25, 2026  02:00 PM",
        text: "Marked as Verified.",
      },
    ],
  },
  {
    id: "INC-20470",
    title: "Public transit verbal harassment incident",
    author: "Priya Shah",
    category: "Harassment",
    status: "Submitted",
    visibility: "Public",
    location: "Birmingham, UK",
    submitted: "Aug 24, 2026  08:20 PM",
    story:
      "Repeated harassment and intimidation by two passengers on the metro bus line. Security personnel failed to intervene.",
    assignee: "Unassigned",
    assignedRole: "",
    assignedAt: "",
    evidence: [
      { type: "MP4", name: "bus-video.mp4", meta: "Video · 14.2 MB" },
    ],
    notes: [],
  },
  {
    id: "INC-20468",
    title: "Racial profiling at campus security gate",
    author: "Rohan Mehta",
    category: "Profiling",
    status: "Under Review",
    visibility: "Private",
    location: "Chicago, US",
    submitted: "Aug 24, 2026  03:10 PM",
    story:
      "Campus security detained and searched my backpack without probable cause while allowing other students through without inspection.",
    assignee: "Moderator David Lee",
    assignedRole: "Moderator",
    assignedAt: "24 Aug 2026  15:30",
    evidence: [
      {
        type: "IMG",
        name: "gate-checkpoint.jpg",
        meta: "Image · 3.4 MB",
      },
    ],
    notes: [
      {
        author: "Moderator David Lee",
        date: "Aug 24, 2026  04:30 PM",
        text: "Requesting statement from student union representative.",
      },
    ],
  },
  {
    id: "INC-20464",
    title: "Unlawful tenant eviction notice",
    author: "Kabir Joshi",
    category: "Housing",
    status: "Dismissed",
    visibility: "Public",
    location: "Manchester, UK",
    submitted: "Aug 23, 2026  10:45 AM",
    story:
      "Landlord served a handwritten 24-hour notice without court authorization or contractual violation.",
    assignee: "Moderator M. Kaur",
    assignedRole: "Moderator",
    assignedAt: "23 Aug 2026  11:00",
    evidence: [
      {
        type: "PDF",
        name: "illegal-notice.pdf",
        meta: "Document · 850 KB",
      },
    ],
    notes: [
      {
        author: "Moderator M. Kaur",
        date: "Aug 23, 2026  12:00 PM",
        text: "Dismissed: Tenant and landlord resolved dispute via rental authority mediation.",
      },
    ],
  },
  {
    id: "INC-20460",
    title: "University disciplinary committee bias",
    author: "Ava Wilson",
    category: "Education",
    status: "Verified",
    visibility: "Public",
    location: "London, UK",
    submitted: "Aug 22, 2026  01:15 PM",
    story:
      "Disciplinary panel denied right to legal representation and passed unilateral suspension without hearing evidence.",
    assignee: "Advocate Sarah Miller",
    assignedRole: "Advocate",
    assignedAt: "22 Aug 2026  13:40",
    evidence: [
      {
        type: "PDF",
        name: "hearing-minutes.pdf",
        meta: "Document · 4.2 MB",
      },
      {
        type: "PDF",
        name: "appeal-brief.pdf",
        meta: "Document · 2.1 MB",
      },
    ],
    notes: [
      {
        author: "Advocate Sarah Miller",
        date: "Aug 22, 2026  03:00 PM",
        text: "Hearing transcript confirmed due process breach.",
      },
    ],
  },
  {
    id: "INC-20455",
    title: "Bank mortgage application discriminatory rejection",
    author: "Daniel Lee",
    category: "Profiling",
    status: "Submitted",
    visibility: "Public",
    location: "New York, US",
    submitted: "Aug 21, 2026  04:00 PM",
    story:
      "Mortgage application rejected despite superior credit score and 30% down payment, while identical profiles in adjacent zip codes were approved.",
    assignee: "Unassigned",
    assignedRole: "",
    assignedAt: "",
    evidence: [
      {
        type: "PDF",
        name: "credit-report.pdf",
        meta: "Document · 1.5 MB",
      },
      {
        type: "PDF",
        name: "rejection-letter.pdf",
        meta: "Document · 920 KB",
      },
    ],
    notes: [],
  },
  {
    id: "INC-20451",
    title: "Online harassment and digital doxxing",
    author: "Emma Davis",
    category: "Digital",
    status: "Under Review",
    visibility: "Private",
    location: "Vancouver, Canada",
    submitted: "Aug 20, 2026  09:30 AM",
    story:
      "Personal home address and phone numbers leaked across community discussion boards following an activist event.",
    assignee: "Moderator David Lee",
    assignedRole: "Moderator",
    assignedAt: "20 Aug 2026  10:00",
    evidence: [
      {
        type: "IMG",
        name: "doxx-screenshot-01.png",
        meta: "Image · 1.1 MB",
      },
    ],
    notes: [],
  },
  {
    id: "INC-20449",
    title: "Workplace safety violation retaliatory discharge",
    author: "Arjun Rao",
    category: "Workplace",
    status: "Verified",
    visibility: "Public",
    location: "Toronto, Canada",
    submitted: "Aug 19, 2026  06:15 PM",
    story:
      "Fired 48 hours after submitting written OSHA compliance concern regarding warehouse machinery.",
    assignee: "Advocate Jason Ross",
    assignedRole: "Advocate",
    assignedAt: "19 Aug 2026  18:30",
    evidence: [
      {
        type: "PDF",
        name: "safety-report-filing.pdf",
        meta: "Document · 3.5 MB",
      },
      {
        type: "PDF",
        name: "termination-email.pdf",
        meta: "Document · 640 KB",
      },
    ],
    notes: [
      {
        author: "Advocate Jason Ross",
        date: "Aug 19, 2026  08:00 PM",
        text: "Whistleblower protection claim verified with labour counsel.",
      },
    ],
  },
  {
    id: "INC-20448",
    title: "Workplace safety dispute archived case",
    author: "Liam Connor",
    category: "Workplace",
    status: "Deactivated",
    visibility: "Private",
    location: "Dublin, Ireland",
    submitted: "Aug 19, 2026  11:20 AM",
    story:
      "Initial occupational safety hazard report. Case deactivated following formal settlement between union and company.",
    assignee: "Moderator M. Kaur",
    assignedRole: "Moderator",
    assignedAt: "19 Aug 2026  11:30",
    evidence: [],
    notes: [
      {
        author: "Lead Admin",
        date: "Aug 19, 2026  02:00 PM",
        text: "Incident deactivated. Reason: Reporter requested removal after union agreement.",
      },
    ],
  },
];

export default incidents;
