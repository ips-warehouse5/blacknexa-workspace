/**
 * Terms of Service agreements and the Technology Provider Protection disclaimer.
 *
 * Ported from `platform/tos.ts`. The disclaimer is not boilerplate — it is the
 * legal position the whole platform depends on: BlackNexa facilitates software,
 * it does not hold funds, employ creators, or give legal advice. It is returned by
 * the compliance API so both apps render identical wording.
 */

import { TosAgreement } from "@/models/compliance.model";
import { prefixedId } from "@/utils/id.util";
import {
  CURRENT_TOS_VERSION,
  DEFAULT_PLATFORM_FEE_PERCENT,
  type TechProviderDisclaimer,
  type TosAgreement as TosAgreementDto,
} from "@/types/platform.interface";

/** The official disclaimer, embedded in the ToS and shown at sign-up. */
export const TECH_PROVIDER_DISCLAIMER: TechProviderDisclaimer = {
  version: "1.0.0",
  disclaimer: `BlackNexa™ is a software and technology provider. We are NOT a bank, employer, legal agency, financial institution, or government entity. We do not hold custody of user funds, employ creators, or provide legal representation. All payment processing is handled by regulated third-party providers (Stripe, Apple, Google). All legal resources and agency routing are informational tools — not legal advice. Users are solely responsible for their interactions with government agencies, legal professionals, and financial institutions. Tipping and Seed Drop features are voluntary peer-to-peer transactions facilitated by our platform; we are not a party to any transaction between users.`,
  notABank: true,
  notAnEmployer: true,
  notALegalAgency: true,
};

class TosService {
  /**
   * Record an acceptance.
   *
   * IP and user agent are captured because they are what make the record
   * evidentiary. Behind a proxy this requires `TRUST_PROXY` to be set, otherwise
   * every row stores the load balancer's address.
   */
  async recordAgreement(
    userId: string,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<TosAgreementDto> {
    const id = prefixedId("tos");
    const now = new Date().toISOString();

    await TosAgreement.create({
      id,
      user_id: userId,
      tos_version: CURRENT_TOS_VERSION,
      agreed_at: now,
      ip_address: metadata?.ipAddress ?? "",
      // Truncated to the column width so an oversized header cannot fail the insert.
      user_agent: (metadata?.userAgent ?? "").slice(0, 512),
    });

    return {
      id,
      userId,
      tosVersion: CURRENT_TOS_VERSION,
      agreedAt: now,
      ipAddress: metadata?.ipAddress ?? "",
      userAgent: metadata?.userAgent ?? "",
    };
  }

  /** True when the user has accepted the *current* version specifically. */
  async hasCurrentTos(userId: string): Promise<boolean> {
    const count = await TosAgreement.count({
      where: { user_id: userId, tos_version: CURRENT_TOS_VERSION },
    });
    return count > 0;
  }

  /** The user's latest acceptance of any version. */
  async getLatestAgreement(userId: string): Promise<TosAgreementDto | null> {
    const row = await TosAgreement.findOne({
      where: { user_id: userId },
      order: [["agreed_at", "DESC"]],
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      tosVersion: row.tos_version,
      agreedAt: row.agreed_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }

  /** The current ToS text, rendered for display at sign-up. */
  getTosText(): string {
    return `BLACKNEXA™ TERMS OF SERVICE — Version ${CURRENT_TOS_VERSION}

By creating an account, you agree to the following:

1. TECHNOLOGY PROVIDER STATUS
${TECH_PROVIDER_DISCLAIMER.disclaimer}

2. USER RESPONSIBILITIES
You agree to use the platform for lawful purposes only. You will not post content that violates community standards, includes hate speech, promotes violence, or contains personal information of others without consent.

3. CONTENT MODERATION
All user-submitted content is subject to automated moderation before publishing. Content that violates our family-friendly, moral-code standards will be rejected.

4. TIPPING AND SEED DROPS
Tips are voluntary peer-to-peer transactions. The platform charges a ${DEFAULT_PLATFORM_FEE_PERCENT}% maintenance fee on each tip to cover payment processing and infrastructure. All amounts are normalized to USD for ledger transparency. Idempotency keys prevent double-charging.

5. DATA PRIVACY (GDPR/CCPA)
Your personal data is encrypted at rest. You have the right to request deletion of your data at any time. Evidence files for the rights protection toolkit are encrypted end-to-end — the platform cannot access the content without your device key.

6. AI NEWS ENGINE
News articles are generated using AI and cross-referenced with verified sources. However, AI-generated content may contain errors. Always verify critical information through the cited sources.

7. NO LEGAL ADVICE
Geo-legal resources, agency routing, and compliance validation are informational tools only. They do not constitute legal advice. Consult a licensed attorney for legal matters.

8. ACCEPTABLE USE
You must be 13 years or older to use this platform. Users under 18 require parental consent for tipping features.

Agreed by clicking "Accept" at sign-up.`;
  }

  /** The disclaimer object, for `GET /platform/compliance/disclaimer`. */
  getDisclaimer(): TechProviderDisclaimer {
    return TECH_PROVIDER_DISCLAIMER;
  }
}

export const tosService = new TosService();
export default tosService;
