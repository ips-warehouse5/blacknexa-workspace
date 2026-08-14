/**
 * BlackNexa™ Global Platform Engine — shared types.
 *
 * Covers the four engineering modules:
 *   1. Fact-Verified AI News Engine API
 *   2. Global Creator Tipping & Seed Drop Engine
 *   3. Zero-Latency Architecture & Performance
 *   4. Legal Compliance & Governance Guardrails
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

// ── Module 1: Fact-Verified AI News Engine ──────────────────────────────

/**
 * The three primary editorial pillars the platform aggregates across,
 * mapped to the internal NewsCategory enum used by the existing news engine.
 */
export type PlatformCategory =
  | "black-business-entrepreneurship"
  | "technology-advancements"
  | "civic-progress"
  // Enterprise Core Engine categories (blacknexa.com API)
  | "black-news-civic-engagement"
  | "black-business-economic-growth"
  | "technology-innovation-advancements"
  | "civil-rights-police-accountability"
  | "hyper-local-community-news"
  | "godly-truth-faith-based-news"
  | "global-weather-atmospheric-intelligence";

export const PLATFORM_CATEGORY_MAP: Record<PlatformCategory, string[]> = {
  "black-business-entrepreneurship": [
    "business-wealth-stewardship",
    "hbcu-education",
  ],
  "technology-advancements": [
    "clean-tech-and-advancements",
    "education-youth-advancement",
  ],
  "civic-progress": [
    "local-national-politics-civic",
    "breaking-geopolitical",
    "faith-commandments-morality",
  ],
  // Enterprise categories map to the same internal news categories
  "black-news-civic-engagement": [
    "local-national-politics-civic",
    "breaking-geopolitical",
  ],
  "black-business-economic-growth": [
    "business-wealth-stewardship",
    "hbcu-education",
  ],
  "technology-innovation-advancements": [
    "clean-tech-and-advancements",
    "education-youth-advancement",
  ],
  "civil-rights-police-accountability": [
    "local-national-politics-civic",
    "faith-commandments-morality",
  ],
  "hyper-local-community-news": [
    "local-national-politics-civic",
    "breaking-geopolitical",
    "business-wealth-stewardship",
  ],
  "godly-truth-faith-based-news": [
    "faith-commandments-morality",
  ],
  "global-weather-atmospheric-intelligence": [
    "clean-tech-and-advancements",
    "breaking-geopolitical",
  ],
};

export const PLATFORM_CATEGORY_LABELS: Record<PlatformCategory, string> = {
  "black-business-entrepreneurship": "Black Business & Entrepreneurship",
  "technology-advancements": "Technology Advancements",
  "civic-progress": "Civic Progress",
  "black-news-civic-engagement": "Black News & Civic Engagement",
  "black-business-economic-growth": "Black Business, Startup Grants & Economic Development",
  "technology-innovation-advancements": "Technology & Innovation Advancements",
  "civil-rights-police-accountability": "Civil Rights, Police Accountability & Anti-Discrimination",
  "hyper-local-community-news": "Hyper-Local Community News",
  "godly-truth-faith-based-news": "Godly Truth & Faith-Based News",
  "global-weather-atmospheric-intelligence": "Global Weather & Atmospheric Intelligence",
};

/** Enterprise Core Engine categories (the 5 from the blacknexa.com API spec). */
export const ENTERPRISE_CATEGORIES: PlatformCategory[] = [
  "godly-truth-faith-based-news",
  "black-news-civic-engagement",
  "black-business-economic-growth",
  "technology-innovation-advancements",
  "civil-rights-police-accountability",
  "hyper-local-community-news",
  "global-weather-atmospheric-intelligence",
];

/** Check if a category is one of the 5 enterprise categories. */
export function isEnterpriseCategory(cat: string): cat is PlatformCategory {
  return ENTERPRISE_CATEGORIES.includes(cat as PlatformCategory);
}

/** BCP-47 locale code for on-the-fly translation. */
export type LocaleCode = string;

/** Fact-verification guardrail result. */
export type FactVerificationResult = {
  verified: boolean;
  /** Sources that were cross-referenced. */
  crossReferencedSources: string[];
  /** Any claims that could not be verified. */
  unverifiedClaims: string[];
  /** Confidence score 0-1. */
  confidence: number;
  /** ISO timestamp. */
  verifiedAt: string;
};

// ── Module 2: Global Creator Tipping & Seed Drop Engine ─────────────────

/** ISO-4217 currency code. */
export type CurrencyCode = string;

/** A creator profile registered to receive tips. */
export type CreatorProfile = {
  id: string;
  /** Rork Auth user ID. */
  userId: string;
  displayName: string;
  handle: string;
  bio: string;
  /** Default currency for receiving tips. */
  defaultCurrency: CurrencyCode;
  /** Stripe Connect account ID (if connected). */
  stripeAccountId?: string;
  /** Whether the creator is verified/wholesome-approved. */
  verified: boolean;
  createdAt: string;
};

/** A micro-tip sent from one user to a creator. */
export type Tip = {
  id: string;
  /** Idempotency key supplied by the client (prevents double-spending). */
  idempotencyKey: string;
  senderUserId: string;
  creatorId: string;
  /** Original amount in the sender's currency. */
  amount: number;
  currency: CurrencyCode;
  /** Amount normalized to USD for ledger reconciliation. */
  amountUsd: number;
  /** Platform maintenance percentage (0-100). */
  platformFeePercent: number;
  /** Platform fee in USD. */
  platformFeeUsd: number;
  /** Net amount to creator in USD. */
  netToCreatorUsd: number;
  /** Payment provider transaction ID. */
  providerTransactionId?: string;
  /** Payment provider (stripe, apple, google). */
  provider: PaymentProvider;
  status: TipStatus;
  /** Optional message attached to the tip. */
  message?: string;
  /** Whether this was a "Seed Drop" (platform-funded micro-grant). */
  isSeedDrop: boolean;
  createdAt: string;
  /** ISO timestamp of settlement. */
  settledAt?: string;
};

export type PaymentProvider = "stripe" | "apple" | "google";
export type TipStatus = "pending" | "succeeded" | "failed" | "refunded";

/** Payout request status lifecycle. */
export type PayoutStatus = "requested" | "processing" | "succeeded" | "failed";

/** A creator's withdrawal / payout request. */
export type Payout = {
  id: string;
  creatorId: string;
  /** Amount in USD cents being withdrawn. */
  amountUsd: number;
  /** Platform payout fee in USD cents. */
  payoutFeeUsd: number;
  /** Net amount sent to the creator after fees. */
  netAmountUsd: number;
  /** Destination: bank, paypal, stripe, etc. */
  destination: PayoutDestination;
  /** Payment provider transfer/transaction ID (filled when processing). */
  providerTransferId?: string;
  status: PayoutStatus;
  /** Client-supplied idempotency key to prevent double-payout. */
  idempotencyKey: string;
  createdAt: string;
  processedAt?: string;
  failureReason?: string;
};

export type PayoutDestination = "stripe" | "bank" | "paypal";

/** Request payload for creating a payout. */
export type PayoutRequest = {
  creatorId: string;
  idempotencyKey: string;
  destination: PayoutDestination;
};

/** Payout fee in USD cents (flat fee per withdrawal). */
export const PAYOUT_FEE_USD_CENTS = 25; // $0.25 flat fee per withdrawal

/** Creator ledger entry — immutable append-only log. */
export type LedgerEntry = {
  id: string;
  creatorId: string;
  tipId: string;
  /** For payout entries, this is the payout ID. */
  referenceId?: string;
  type: "credit" | "debit" | "payout" | "adjustment";
  amountUsd: number;
  balanceAfterUsd: number;
  description: string;
  createdAt: string;
};

/** Creator balance summary. */
export type CreatorBalance = {
  creatorId: string;
  availableUsd: number;
  pendingUsd: number;
  totalReceivedUsd: number;
  totalTips: number;
  currency: CurrencyCode;
};

/** Request to send a tip. */
export type SendTipRequest = {
  idempotencyKey: string;
  senderUserId: string;
  creatorId: string;
  amount: number;
  currency: CurrencyCode;
  message?: string;
  isSeedDrop?: boolean;
};

/** Stripe webhook event (slim shape for our handler). */
export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount?: number;
      currency?: string;
      status?: string;
      metadata?: Record<string, string>;
      transfer_data?: {
        destination?: string;
        amount?: number;
      };
    };
  };
};

// ── Module 3: Zero-Latency Architecture ─────────────────────────────────

/** Cache entry stored in the platform DO's SQLite cache table. */
export type CacheEntry = {
  key: string;
  value: string;
  expiresAt: number;
  createdAt: number;
};

/** Background job enqueued in the async worker queue. */
export type QueueJob = {
  id: string;
  type: QueueJobType;
  payload: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  scheduledAt: number;
  processedAt?: number;
  error?: string;
};

export type QueueJobType =
  | "translate-article"
  | "translate-legal"
  | "ledger-update"
  | "image-generation"
  | "audio-generation"
  | "content-moderation"
  | "fact-verification"
  | "seed-drop-distribution";

// ── Module 4: Legal Compliance & Governance ─────────────────────────────

/** Content moderation result. */
export type ModerationResult = {
  approved: boolean;
  /** Flagged terms found (redacted in logs). */
  flaggedTerms: string[];
  /** Category of violation. */
  violationCategory: ModerationCategory | null;
  /** Hash of the content for dedup. */
  contentHash: string;
  /** ISO timestamp. */
  moderatedAt: string;
};

export type ModerationCategory =
  | "profanity"
  | "hate-speech"
  | "violence"
  | "adult-content"
  | "spam"
  | "personal-info";

/** ToS agreement record. */
export type TosAgreement = {
  id: string;
  userId: string;
  tosVersion: string;
  agreedAt: string;
  ipAddress: string;
  userAgent: string;
};

/** Technology Provider Protection disclaimer metadata. */
export type TechProviderDisclaimer = {
  disclaimer: string;
  version: string;
  /** The platform is a software/technology provider, NOT a: */
  notABank: boolean;
  notAnEmployer: boolean;
  notALegalAgency: boolean;
};

/** Current ToS version — increment when terms change. */
export const CURRENT_TOS_VERSION = "1.0.0";

/** Platform maintenance fee percentage for tips (default 8%). */
export const DEFAULT_PLATFORM_FEE_PERCENT = 8;

/** Minimum tip amount in USD cents. */
export const MIN_TIP_USD_CENTS = 100;

/** Maximum tip amount in USD cents (anti-fraud). */
export const MAX_TIP_USD_CENTS = 500_00;
