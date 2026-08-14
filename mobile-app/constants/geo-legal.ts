/**
 * BlackNexa™ Geo-Legal client-side types — mirrors the backend
 * `functions/_lib/geo-legal/types.ts` so the mobile apps and the Worker
 * speak the same shape.
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

import type { IncidentCategory } from "@/mocks/incidents";

export type PrivacyRegime =
  | "GDPR"
  | "CCPA"
  | "PIPEDA"
  | "LGPD"
  | "POPIA"
  | "UK_DPA"
  | "APP"
  | "PDPA"
  | "GENERAL";

export type LegalFramework = {
  name: string;
  citation: string;
  summary: string;
  categories: IncidentCategory[];
  url?: string;
};

export type OversightAgency = {
  id: string;
  name: string;
  tier: "NATIONAL" | "REGIONAL" | "LOCAL" | "INTERNATIONAL";
  portalUrl: string;
  intakeEmail?: string;
  phone?: string;
  categories: IncidentCategory[];
  description: string;
  aiVerified: boolean;
};

export type PressContact = {
  id: string;
  name: string;
  type: "INVESTIGATIVE" | "NATIONAL" | "REGIONAL" | "INTERNATIONAL";
  portalUrl: string;
  intakeEmail?: string;
  categories: IncidentCategory[];
  description: string;
  aiVerified: boolean;
};

export type JurisdictionProfile = {
  countryCode: string;
  countryName: string;
  primaryLanguage: string;
  privacyRegime: PrivacyRegime;
  legalFrameworks: LegalFramework[];
  agencies: OversightAgency[];
  pressContacts: PressContact[];
  source: "curated" | "ai-generated";
  generatedAt: string;
};

export type ReportDraft = {
  title: string;
  summary: string;
  category: IncidentCategory;
  area: string;
  countryCode: string;
  subdivisionCode?: string;
  occurredAt?: string;
  userIsParticipant?: boolean;
  obtainedExplicitConsent?: boolean;
  inPublicSpace?: boolean;
};

export type ValidationResult = {
  compliant: boolean;
  missingFields: string[];
  formattingIssues: string[];
  formattedSummary: string;
  requiresHumanConfirmation: boolean;
  governingJurisdiction: string;
  privacyRegime: PrivacyRegime;
  validatedAt: string;
};

export type DispatchChannel =
  | "GOVT_AGENCY"
  | "PRESS"
  | "HUMAN_RIGHTS"
  | "LEGAL_NETWORK";

export type DispatchResult = {
  success: boolean;
  dispatchedTo: Array<{
    agencyId: string;
    agencyName: string;
    channel: DispatchChannel;
    portalUrl: string;
    status: "AUDIT_RECORDED";
  }>;
  auditId: string;
  error?: string;
};

export type CreateIncidentResponse = {
  success: boolean;
  incidentId?: string;
  error?: string;
};

export const PRIVACY_REGIME_LABELS: Record<PrivacyRegime, string> = {
  GDPR: "GDPR (EU)",
  CCPA: "CCPA (California)",
  PIPEDA: "PIPEDA (Canada)",
  LGPD: "LGPD (Brazil)",
  POPIA: "POPIA (South Africa)",
  UK_DPA: "UK DPA 2018",
  APP: "Australian Privacy Principles",
  PDPA: "PDPA",
  GENERAL: "General Data Protection",
};

export const AGENCY_TIER_LABELS: Record<
  OversightAgency["tier"],
  string
> = {
  NATIONAL: "National",
  REGIONAL: "Regional",
  LOCAL: "Local",
  INTERNATIONAL: "International",
};

export const PRESS_TYPE_LABELS: Record<PressContact["type"], string> = {
  INVESTIGATIVE: "Investigative",
  NATIONAL: "National",
  REGIONAL: "Regional",
  INTERNATIONAL: "International",
};

/**
 * Uniform International Jurisdiction & Mobile Resource Mapping — the
 * GLOBAL_RESOURCE_REGIONS layer from the BlackNexa master configuration.
 * Mirrors GET /api/v1/geo-legal/regions so the hub renders instantly offline.
 */
export type GlobalResourceRegion = {
  id: string;
  displayName: string;
  flag: string;
  primaryFocus: string;
  authorities: string[];
  pressRouting: string[];
  /** Country codes resolvable via the geo-legal lookup engine. */
  countryCodes: string[];
  resourceCenterEnabled: boolean;
};

/**
 * Cross-platform engine identity — mirrors the backend
 * initialize_cross_platform_engine() metadata from the master configuration.
 */
export const ENGINE_INFO = {
  platformName: "BlackNexa\u2122",
  version: "2.6.5-Global-CrossPlatform",
  supportedOs: ["iOS", "Android"] as const,
  coreMission: "God First & Intent for Truth",
  contactSupport: "media@blacknexa.com",
} as const;

export const GLOBAL_RESOURCE_REGIONS: GlobalResourceRegion[] = [
  {
    id: "united_states",
    displayName: "United States",
    flag: "\u{1F1FA}\u{1F1F8}",
    primaryFocus: "Black, brown, and underserved communities nationwide",
    authorities: ["EEOC", "Department of Justice (Civil Rights Division)", "State Human Rights Commissions"],
    pressRouting: ["BlackNexa News Network", "National Independent Press Outlets"],
    countryCodes: ["US"],
    resourceCenterEnabled: true,
  },
  {
    id: "france",
    displayName: "France",
    flag: "\u{1F1EB}\u{1F1F7}",
    primaryFocus: "Underserved urban communities and minority populations facing systemic bias",
    authorities: ["D\u00e9fenseur des droits", "Commission Nationale Consultative des Droits de l'Homme"],
    pressRouting: ["European Human Rights Media Outlets", "BlackNexa Global Press"],
    countryCodes: ["FR"],
    resourceCenterEnabled: true,
  },
  {
    id: "africa_hub",
    displayName: "Africa (Continental Hub)",
    flag: "\u{1F30D}",
    primaryFocus: "Empowering emerging markets, youth, and entrepreneurial growth across African nations",
    authorities: ["African Commission on Human and Peoples' Rights (ACHPR)", "Regional Legal Aid NGOs"],
    pressRouting: ["Pan-African Investigative Networks", "BlackNexa Global Press"],
    countryCodes: ["NG", "KE", "GH", "ET"],
    resourceCenterEnabled: true,
  },
  {
    id: "india",
    displayName: "India",
    flag: "\u{1F1EE}\u{1F1F3}",
    primaryFocus: "Marginalized communities, caste/minority protection, and human rights advocacy",
    authorities: ["National Human Rights Commission of India (NHRC)", "National Commission for Minorities", "Supreme Court Legal Services Committee"],
    pressRouting: ["Independent Indian Investigative Press", "BlackNexa Global Press"],
    countryCodes: ["IN"],
    resourceCenterEnabled: true,
  },
  {
    id: "brazil",
    displayName: "Brazil",
    flag: "\u{1F1E7}\u{1F1F7}",
    primaryFocus: "Afro-descendant, brown, and underserved communities facing socioeconomic disparities",
    authorities: ["Defensoria P\u00fablica da Uni\u00e3o", "Minist\u00e9rio dos Direitos Humanos e da Cidadania"],
    pressRouting: ["Brazilian Civil Rights Press", "BlackNexa Global Press"],
    countryCodes: ["BR"],
    resourceCenterEnabled: true,
  },
  {
    id: "united_kingdom",
    displayName: "United Kingdom",
    flag: "\u{1F1EC}\u{1F1E7}",
    primaryFocus: "BAME (Black, Asian, and Minority Ethnic) underserved communities facing systemic disparities",
    authorities: ["Equality and Human Rights Commission (EHRC)", "Citizens Advice Bureau"],
    pressRouting: ["UK Independent Investigative Outlets", "BlackNexa Global Press"],
    countryCodes: ["GB"],
    resourceCenterEnabled: true,
  },
  {
    id: "south_africa",
    displayName: "South Africa",
    flag: "\u{1F1FF}\u{1F1E6}",
    primaryFocus: "Post-apartheid economic empowerment, equality, and civil protection",
    authorities: ["South African Human Rights Commission (SAHRC)", "Commission for Gender Equality"],
    pressRouting: ["South African Investigative Media", "BlackNexa Global Press"],
    countryCodes: ["ZA"],
    resourceCenterEnabled: true,
  },
  {
    id: "canada",
    displayName: "Canada",
    flag: "\u{1F1E8}\u{1F1E6}",
    primaryFocus: "BIPOC and underserved communities facing systemic barriers in housing, justice, and education",
    authorities: ["Canadian Human Rights Commission (CHRC)", "Provincial Human Rights Tribunals"],
    pressRouting: ["Canadian Independent Press Outlets", "BlackNexa Global Press"],
    countryCodes: ["CA"],
    resourceCenterEnabled: true,
  },
];

/** Common country list for the manual picker. */
export const COMMON_COUNTRIES: Array<{ code: string; name: string; flag: string }> = [
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "JM", name: "Jamaica", flag: "🇯🇲" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
];
