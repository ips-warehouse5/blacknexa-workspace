/**
 * BlackNexa™ Uniform International Jurisdiction & Mobile Resource Mapping
 *
 * The GLOBAL_RESOURCE_REGIONS layer from the BlackNexa master configuration —
 * eight uniform resource regions covering the United States, France, the
 * African continental hub, India, Brazil, the United Kingdom, South Africa,
 * and Canada. Each region carries its primary community focus, accredited
 * routing authorities, press networks, and the country codes that resolve to
 * full jurisdiction profiles through the geo-legal engine.
 *
 * Closed/authoritarian regimes where independent rights reporting is
 * restricted are intentionally excluded per the master mandate.
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

/** One uniform global resource region. */
export type GlobalResourceRegion = {
  id: string;
  displayName: string;
  /** Flag or region emoji for compact UI rendering. */
  flag: string;
  /** Who this region's resource center primarily serves. */
  primaryFocus: string;
  /** Accredited authorities reports are routed to. */
  authorities: string[];
  /** Verified press networks for press routing. */
  pressRouting: string[];
  /** ISO-3166 alpha-2 codes resolvable via GET /api/v1/geo-legal/lookup. */
  countryCodes: string[];
  resourceCenterEnabled: boolean;
};

/** Cross-platform engine metadata mirroring initialize_cross_platform_engine(). */
export const ENGINE_INFO = {
  platformName: "BlackNexa™",
  version: "2.6.5-Global-CrossPlatform",
  supportedOs: ["iOS", "Android"],
  coreMission: "God First & Intent for Truth",
  contactSupport: "media@blacknexa.com",
} as const;

export const GLOBAL_RESOURCE_REGIONS: GlobalResourceRegion[] = [
  {
    id: "united_states",
    displayName: "United States",
    flag: "🇺🇸",
    primaryFocus: "Black, brown, and underserved communities nationwide",
    authorities: [
      "EEOC",
      "Department of Justice (Civil Rights Division)",
      "State Human Rights Commissions",
    ],
    pressRouting: ["BlackNexa News Network", "National Independent Press Outlets"],
    countryCodes: ["US"],
    resourceCenterEnabled: true,
  },
  {
    id: "france",
    displayName: "France",
    flag: "🇫🇷",
    primaryFocus:
      "Underserved urban communities and minority populations facing systemic bias",
    authorities: [
      "Défenseur des droits",
      "Commission Nationale Consultative des Droits de l'Homme",
    ],
    pressRouting: ["European Human Rights Media Outlets", "BlackNexa Global Press"],
    countryCodes: ["FR"],
    resourceCenterEnabled: true,
  },
  {
    id: "africa_hub",
    displayName: "Africa (Continental Hub)",
    flag: "🌍",
    primaryFocus:
      "Empowering emerging markets, youth, and entrepreneurial growth across African nations",
    authorities: [
      "African Commission on Human and Peoples' Rights (ACHPR)",
      "Regional Legal Aid NGOs",
    ],
    pressRouting: ["Pan-African Investigative Networks", "BlackNexa Global Press"],
    countryCodes: ["NG", "KE", "GH", "ET"],
    resourceCenterEnabled: true,
  },
  {
    id: "india",
    displayName: "India",
    flag: "🇮🇳",
    primaryFocus:
      "Marginalized communities, caste/minority protection, and human rights advocacy",
    authorities: [
      "National Human Rights Commission of India (NHRC)",
      "National Commission for Minorities",
      "Supreme Court Legal Services Committee",
    ],
    pressRouting: ["Independent Indian Investigative Press", "BlackNexa Global Press"],
    countryCodes: ["IN"],
    resourceCenterEnabled: true,
  },
  {
    id: "brazil",
    displayName: "Brazil",
    flag: "🇧🇷",
    primaryFocus:
      "Afro-descendant, brown, and underserved communities facing socioeconomic disparities",
    authorities: [
      "Defensoria Pública da União",
      "Ministério dos Direitos Humanos e da Cidadania",
    ],
    pressRouting: ["Brazilian Civil Rights Press", "BlackNexa Global Press"],
    countryCodes: ["BR"],
    resourceCenterEnabled: true,
  },
  {
    id: "united_kingdom",
    displayName: "United Kingdom",
    flag: "🇬🇧",
    primaryFocus:
      "BAME (Black, Asian, and Minority Ethnic) underserved communities facing systemic disparities",
    authorities: [
      "Equality and Human Rights Commission (EHRC)",
      "Citizens Advice Bureau",
    ],
    pressRouting: ["UK Independent Investigative Outlets", "BlackNexa Global Press"],
    countryCodes: ["GB"],
    resourceCenterEnabled: true,
  },
  {
    id: "south_africa",
    displayName: "South Africa",
    flag: "🇿🇦",
    primaryFocus: "Post-apartheid economic empowerment, equality, and civil protection",
    authorities: [
      "South African Human Rights Commission (SAHRC)",
      "Commission for Gender Equality",
    ],
    pressRouting: ["South African Investigative Media", "BlackNexa Global Press"],
    countryCodes: ["ZA"],
    resourceCenterEnabled: true,
  },
  {
    id: "canada",
    displayName: "Canada",
    flag: "🇨🇦",
    primaryFocus:
      "BIPOC and underserved communities facing systemic barriers in housing, justice, and education",
    authorities: [
      "Canadian Human Rights Commission (CHRC)",
      "Provincial Human Rights Tribunals",
    ],
    pressRouting: ["Canadian Independent Press Outlets", "BlackNexa Global Press"],
    countryCodes: ["CA"],
    resourceCenterEnabled: true,
  },
];
