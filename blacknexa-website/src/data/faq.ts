/**
 * Website FAQ content.
 *
 * Served by the platform API (`GET /help/faq?surface=website`), which is the
 * same store the mobile Help screen and the admin console use — an editor
 * changes an answer once and both surfaces follow.
 *
 * The list below stays as the fallback. The FAQ section is part of the page a
 * visitor is deciding on, and a blank one because the API was briefly
 * unreachable is worse than answers that are a release behind. It is the copy
 * this site already shipped, and it seeded the `website` surface in the
 * database, so the fallback and the live content start identical.
 */

import { apiGet } from "@/lib/api/client";

export type FaqItem = {
  q: string;
  a: string;
};

export const FALLBACK_FAQS: FaqItem[] = [
  {
    q: "What exactly is BlackNexa?",
    // Client-supplied copy (24 Sep 2026); must match the answer in
    // blacknexa-backend/src/data/faq_seed.data.ts.
    a: [
      "BlackNexa™ is a groundbreaking, God-centered ecosystem that combines a global social network with a social justice platform, designed to protect, connect, and empower Black, brown, and underserved communities. In plain terms, it is a mobile application that acts as both a digital shield for your personal safety and a wholesome digital home for your community.",
      "What the App Does:",
      "• The Godly Community Feed & Social Network: This is the heart of the app's social side. Spanning across local towns, U.S. cities, and international borders worldwide, it is a safe, peaceful space where people can connect, discuss business, share everyday life, and address social or political issues—all conducted in a godly manner with mutual respect, keeping God's commandments, and loving our neighbor as ourselves.",
      "• The Injustice Pocket Recorder & Systemic Protection: If you ever face systemic racism, racial profiling, or unfair public encounters, this tool puts power directly back into the hands of the people. With a single tap, it records video while automatically locking in unalterable GPS coordinates, timestamps, and metadata. By capturing undeniable, objective evidence of systemic injustice on the spot, it prevents these incidents from being swept under the rug, deters misconduct through transparent accountability, and ensures accountability is enforced.",
      "• Encrypted Evidence Vault & Automated Routing: Your captured recordings are securely backed up and structured so they can be automatically routed to the appropriate oversight bodies, human rights regulatory agencies, and legal advocates who have the authority to act on what you report.",
      "• AI Fact-Check News Engine: A smart news engine that cuts straight through media spin and systemic bias to give you clear, fact-driven information on important topics.",
    ].join("\n\n"),
  },
  {
    q: "When does the app launch?",
    a: "We are in pre-launch now, with iOS and Android at release. Join the waitlist and you get the download alert the moment we hit the Apple App Store and Google Play.",
  },
  {
    q: "What will it cost?",
    a: "Pricing at launch is being finalised. Waitlist members are told first, before any public announcement.",
  },
  {
    q: "Does filing a report guarantee an investigation?",
    a: "No. BlackNexa is a technology and software platform provider, not a government agency, law firm, or legal referral service. We document, secure, and route your report; all intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.",
  },
  {
    q: "How is my evidence protected?",
    a: "Files are encrypted in transit and at rest in the secure vault. Each record is hashed at creation alongside its GPS coordinates and timestamp, so a recipient can confirm it has not been altered since capture.",
  },
  {
    q: "Can I post anonymously?",
    a: "The community feed supports anonymous posts. Reports routed to an agency carry the detail that agency requires in order to act.",
  },
  {
    q: "Which countries does it work in?",
    a: "Automated AI geographic research connects users anywhere in the world with the local, state, national, and international oversight authorities relevant to their incident, so it works domestically and internationally.",
  },
  {
    q: "How is the news verified?",
    a: "Every story is backed by three to five factual sources and reviewed daily by our editorial team, focused on Black business, technology, economic power, and faith-based content.",
  },
  {
    q: "How do I reach you about partnership or press?",
    a: "Write to advertising@blacknexa.com for partnerships and advertising, press@blacknexa.com for media, or legal@blacknexa.com for legal matters. The contact form reaches the same people.",
  },
];

/** One entry as the API sends it. */
interface ApiFaqItem {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
}

/**
 * The published website FAQ.
 *
 * Goes through the shared `apiGet`, which sends `cache: "no-store"` — so this
 * is a fresh read on every render. That is affordable because the homepage is
 * already `force-dynamic` for the News section, and because the API caches the
 * payload for ten minutes on its side; the round trip is server-to-server and
 * almost always answered from that cache.
 *
 * Never throws. Any failure — unconfigured API, unreachable, empty payload —
 * falls back to the bundled copy, because the section has to render either way.
 */
export async function getFaqs(): Promise<FaqItem[]> {
  try {
    const payload = await apiGet<{ items?: ApiFaqItem[] }>("/help/faq?surface=website");
    const items = payload?.items ?? [];
    if (items.length === 0) return FALLBACK_FAQS;
    return items.map((item) => ({ q: item.question, a: item.answer }));
  } catch {
    return FALLBACK_FAQS;
  }
}
