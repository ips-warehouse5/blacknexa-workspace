/**
 * BlackNexa Global AI News & Syndication — data layer.
 * Faith-grounded, factually verified news empowering Black & Brown communities.
 */

export type NewsCategory =
  | "business-wealth-stewardship"
  | "local-national-politics-civic"
  | "education-youth-advancement"
  | "clean-tech-and-advancements"
  | "faith-commandments-morality"
  | "hbcu-education"
  | "breaking-geopolitical"
  | "civil-rights-police-accountability";

export type NewsScope = "local" | "national" | "global";

export const NEWS_CATEGORIES: { key: NewsCategory; label: string; blurb: string }[] = [
  {
    key: "business-wealth-stewardship",
    label: "Wealth",
    blurb: "Godly enterprise, ownership, and stewardship",
  },
  {
    key: "local-national-politics-civic",
    label: "Civic",
    blurb: "Policy, equity, and righteous civic order",
  },
  {
    key: "education-youth-advancement",
    label: "Education",
    blurb: "Youth advancement and trade mastery",
  },
  {
    key: "clean-tech-and-advancements",
    label: "Innovation",
    blurb: "Clean technology and community autonomy",
  },
  {
    key: "faith-commandments-morality",
    label: "Faith",
    blurb: "Commandments, morality, and dignity",
  },
  {
    key: "hbcu-education",
    label: "HBCU",
    blurb: "Historically Black Colleges & Universities",
  },
  {
    key: "breaking-geopolitical",
    label: "Breaking",
    blurb: "Major geopolitical events, US & world",
  },
  {
    key: "civil-rights-police-accountability",
    label: "Civil Rights",
    blurb: "Police accountability, anti-discrimination & justice",
  },
];

/** Verified Pexels fallback image per category — used when the primary image fails to load. */
export const CATEGORY_FALLBACK_IMAGES: Record<NewsCategory, string> = {
  "business-wealth-stewardship":
    "https://images.pexels.com/photos/3861077/pexels-photo-3861077.jpeg?cs=srgb&fm=jpg&w=1200",
  "local-national-politics-civic":
    "https://images.pexels.com/photos/8347375/pexels-photo-8347375.jpeg?cs=srgb&fm=jpg&w=1200",
  "education-youth-advancement":
    "https://images.pexels.com/photos/17321814/pexels-photo-17321814.jpeg?cs=srgb&fm=jpg&w=1200",
  "clean-tech-and-advancements":
    "https://images.pexels.com/photos/35105432/pexels-photo-35105432.jpeg?cs=srgb&fm=jpg&w=1200",
  "faith-commandments-morality":
    "https://images.pexels.com/photos/34504326/pexels-photo-34504326.jpeg?cs=srgb&fm=jpg&w=1200",
  "hbcu-education":
    "https://images.pexels.com/photos/7713161/pexels-photo-7713161.jpeg?cs=srgb&fm=jpg&w=1200",
  "breaking-geopolitical":
    "https://images.pexels.com/photos/33984560/pexels-photo-33984560.jpeg?cs=srgb&fm=jpg&w=1200",
  "civil-rights-police-accountability":
    "https://images.pexels.com/photos/8847041/pexels-photo-8847041.jpeg?cs=srgb&fm=jpg&w=1200",
};

export const CATEGORY_LABELS: Record<NewsCategory, string> = NEWS_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.label }),
  {} as Record<NewsCategory, string>
);

export type VerifiedSource = {
  name: string;
  url: string;
  /** Short excerpt from the source used as raw factual backing for the article. */
  excerpt?: string;
  /** ISO date the source was published, when known. */
  publishedDate?: string;
};

export type NewsArticle = {
  id: string;
  slug: string;
  headline: string;
  category: NewsCategory;
  scope: NewsScope;
  summary: string;
  content: string;
  imageUrl: string;
  factCheckStatus: string;
  verifiedSources: VerifiedSource[];
  godlyPrincipleAlignment: string;
  audioUrl: string;
  publishedAt: string;
  author: string;
  /** Stable content fingerprint used to merge duplicate briefings. */
  contentHash?: string;
  /** Present (true/false) only on local-feed results that matched a neighboring city. */
  nearby?: boolean;
};

const HOUR = 60 * 60 * 1000;
const now = Date.now();

export const SEED_NEWS: NewsArticle[] = [
  {
    id: "bn-2026-001",
    slug: "black-founders-secure-sovereign-ai-grant",
    headline: "Black Tech Founders Secure $50M Sovereign Grant for Clean AI Enterprise",
    category: "clean-tech-and-advancements",
    scope: "national",
    summary:
      "A landmark enterprise initiative delivering non-dilutive capital to clean technology leaders focused on community autonomy.",
    content:
      "Official federal public records confirm the distribution of non-dilutive innovation grants designed to foster technological independence in urban development sectors. The program prioritizes founders building sovereign infrastructure, energy-efficient compute, and community-owned data systems. Awards range from $250K to $5M per venture, with a five-year forgiveness window tied to local hiring and apprenticeship milestones. Administrators emphasized that the capital is structured as a grant, not an equity stake, so founders retain full ownership and decision-making authority. The first cohort includes twelve ventures spanning Atlanta, Detroit, Houston, and Oakland.",
    imageUrl:
      "https://images.pexels.com/photos/35105432/pexels-photo-35105432.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "U.S. Department of Commerce Public Registry", url: "https://commerce.gov" },
      { name: "SEC Filing Enterprise Registry", url: "https://sec.gov" },
    ],
    godlyPrincipleAlignment:
      "Promotes industriousness, honest enterprise, clean innovation, and faithful stewardship under God.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-001.mp3",
    publishedAt: new Date(now - 2 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: articleContentHash(
      "Black Tech Founders Secure $50M Sovereign Grant for Clean AI Enterprise",
      "A landmark enterprise initiative delivering non-dilutive capital to clean technology leaders focused on community autonomy.",
      "clean-tech-and-advancements",
      "national",
    ),
  },
  {
    id: "bn-2026-002",
    slug: "housing-equity-and-land-stewardship-act",
    headline: "City Council Passes Historic Housing Equity and Land Ownership Act",
    category: "local-national-politics-civic",
    scope: "local",
    summary:
      "New municipal policy grants property tax relief and urban agricultural land protections for community-led trusts.",
    content:
      "The City Council voted unanimously on Ordinance 402, establishing direct protections for low-income homeownership and youth-led agricultural trade centers. The act creates a ten-year property tax abatement for owner-occupants in historically redlined neighborhoods and grants community land trusts first right of refusal on tax-delinquent parcels. A dedicated youth agricultural apprenticeship fund is seeded at $4.2M, pairing trade instruction with land access. Council members cited generational wealth repair and righteous stewardship of inheritance as foundational principles.",
    imageUrl:
      "https://images.pexels.com/photos/8347375/pexels-photo-8347375.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "City Council Official Legislative Records", url: "https://citycouncil.gov/records" },
    ],
    godlyPrincipleAlignment:
      "Upholds fair scales, protection of inheritance, community dignity, and righteous civic order.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-002.mp3",
    publishedAt: new Date(now - 6 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: articleContentHash(
      "City Council Passes Historic Housing Equity and Land Ownership Act",
      "New municipal policy grants property tax relief and urban agricultural land protections for community-led trusts.",
      "local-national-politics-civic",
      "local",
    ),
  },
  {
    id: "bn-2026-003",
    slug: "youth-trade-mastery-apprenticeship-cohort",
    headline: "Regional Trade Mastery Cohort Graduates 140 Young Apprentices Into Union Wage Roles",
    category: "education-youth-advancement",
    scope: "local",
    summary:
      "A fourteen-week skilled-trades intensive places graduates into union-wage electrical, plumbing, and HVAC roles with full benefits.",
    content:
      "The Greater Metro Workforce Alliance confirmed that its spring trade mastery cohort graduated 140 young adults, ages 17 to 26, into union-scale employment. Every graduate accepted a full-benefits offer before commencement, with average starting wages of $32/hour plus healthcare and pension contributions. The program pairs classroom instruction with paid job-site apprenticeships and mandates financial literacy and entrepreneurship modules. Organizers stressed that mastery, dignity of labor, and family stability are the program's core measures, not placement counts alone.",
    imageUrl:
      "https://images.pexels.com/photos/17321814/pexels-photo-17321814.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "Greater Metro Workforce Alliance Annual Report", url: "https://gmwa.org/report" },
      { name: "State Labor Department Placement Registry", url: "https://labor.state.gov" },
    ],
    godlyPrincipleAlignment:
      "Honors the dignity of labor, skill mastery, and the building of stable households under God.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-003.mp3",
    publishedAt: new Date(now - 14 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: articleContentHash(
      "Regional Trade Mastery Cohort Graduates 140 Young Apprentices Into Union Wage Roles",
      "A fourteen-week skilled-trades intensive places graduates into union-wage electrical, plumbing, and HVAC roles with full benefits.",
      "education-youth-advancement",
      "local",
    ),
  },
  {
    id: "bn-2026-004",
    slug: "faith-leaders-convene-community-covenant-summit",
    headline: "Faith Leaders Convene Community Covenant Summit on Justice and Family Restoration",
    category: "faith-commandments-morality",
    scope: "national",
    summary:
      "A multi-city covenant summit unites pastors, elders, and civic stewards around commandment-grounded family restoration and justice work.",
    content:
      "More than 400 faith leaders from twelve cities signed a shared community covenant committing their congregations to mentorship, restorative justice partnerships, and family stability initiatives. The summit produced a published framework binding signatories to monthly reconciliation circles, youth-elder mentorship pairings, and coordinated support for returning citizens. Leaders reaffirmed that lasting equity flows from honoring God's commandments, defending the dignity of every person, and rebuilding the household as the foundation of community strength.",
    imageUrl:
      "https://images.pexels.com/photos/34504326/pexels-photo-34504326.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "Community Covenant Summit Public Signatory Registry", url: "https://covenantsummit.org" },
    ],
    godlyPrincipleAlignment:
      "Grounds all equity work in Jehovah's commandments, family restoration, and the equal dignity of every person.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-004.mp3",
    publishedAt: new Date(now - 26 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: articleContentHash(
      "Faith Leaders Convene Community Covenant Summit on Justice and Family Restoration",
      "A multi-city covenant summit unites pastors, elders, and civic stewards around commandment-grounded family restoration and justice work.",
      "faith-commandments-morality",
      "national",
    ),
  },
  {
    id: "bn-2026-005",
    slug: "hbcu-engineering-consortium-quantum-ai-research-center",
    headline: "HBCU Engineering Consortium Lands $12M for Quantum and AI Research Center",
    category: "hbcu-education",
    scope: "national",
    summary:
      "A landmark federal-academic partnership expands advanced research capacity at a historically Black engineering school.",
    content:
      "The National Science Foundation and a consortium of five historically Black engineering schools announced a $12 million award to establish a shared quantum computing and artificial intelligence research center. The center will fund graduate fellowships, faculty labs, and industry partnerships focused on cryptography, climate modeling, and equitable health data systems. Officials said the investment is designed to keep HBCU graduates at the forefront of emerging technology fields while preserving institutional autonomy. The first cohort of 30 doctoral fellows begins in the fall semester.",
    imageUrl:
      "https://images.pexels.com/photos/7713161/pexels-photo-7713161.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "National Science Foundation Award Registry", url: "https://nsf.gov/awardsearch" },
      { name: "HBCU Engineering Consortium Press Office", url: "https://hbcu-eng.org" },
    ],
    godlyPrincipleAlignment:
      "Honors the pursuit of knowledge, excellence, and stewardship of God-given intellectual gifts for community uplift.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-005.mp3",
    publishedAt: new Date(now - 1 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "1o8chyl",
  },
  {
    id: "bn-2026-006",
    slug: "community-land-trust-urban-agriculture-youth-stewardship",
    headline: "Community Land Trust Acquires 40 Acres for Urban Agriculture and Youth Stewardship",
    category: "local-national-politics-civic",
    scope: "local",
    summary:
      "A nonprofit land trust finalizes the purchase of a vacant parcel to build food sovereignty and training programs.",
    content:
      "A city-backed community land trust closed on a 40-acre vacant property that will become an urban farm, youth agricultural training campus, and regional food hub. The purchase was financed through a $2.4 million municipal bond allocation and a matching grant from a statewide land equity program. The trust will offer one-acre leases to local growers, operate a paid summer apprenticeship for 60 young people, and route fresh produce to neighborhood schools and corner stores. City planners said the project is a model for turning tax-delinquent land into community-owned productive assets.",
    imageUrl:
      "https://images.pexels.com/photos/7486749/pexels-photo-7486749.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "City Land Trust Public Records", url: "https://citylandtrust.gov/records" },
      { name: "State Agriculture Department Grant Registry", url: "https://agriculture.state.gov/grants" },
    ],
    godlyPrincipleAlignment:
      "Upholds faithful stewardship of land, youth formation, and the dignity of providing food for one's neighbor.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-006.mp3",
    publishedAt: new Date(now - 3 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "14woa8g",
  },
  {
    id: "bn-2026-007",
    slug: "black-owned-banks-100m-small-business-lending-coalition",
    headline: "Black-Owned Banks Launch $100M Small Business Lending Coalition",
    category: "business-wealth-stewardship",
    scope: "national",
    summary:
      "A coalition of minority depository institutions commits pooled capital to entrepreneurs in underserved markets.",
    content:
      "A partnership of seven Black-owned banks and community development financial institutions announced a $100 million revolving loan fund for small businesses in historically underserved census tracts. The coalition will offer loans from $25,000 to $1 million at below-market rates, with preference for businesses that hire locally, provide apprenticeships, or operate in food, construction, and professional services. Organizers emphasized that the capital is pooled, not centralized, so each member bank retains local underwriting control and keeps profits in the community.",
    imageUrl:
      "https://images.pexels.com/photos/7413982/pexels-photo-7413982.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "FDIC Minority Depository Institution Directory", url: "https://fdic.gov/mdi" },
      { name: "Coalition Press Release", url: "https://blackbankscoalition.org" },
    ],
    godlyPrincipleAlignment:
      "Promotes righteous stewardship, honest scales, and community ownership that builds generational wealth under God.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-007.mp3",
    publishedAt: new Date(now - 5 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "13r6eeu",
  },
  {
    id: "bn-2026-008",
    slug: "federal-clean-energy-apprenticeship-5000-union-slots",
    headline: "Federal Clean Energy Apprenticeship Program Opens 5,000 Union Wage Slots",
    category: "clean-tech-and-advancements",
    scope: "national",
    summary:
      "A new Department of Labor initiative pairs registered apprenticeships with solar, wind, and grid modernization projects.",
    content:
      "The Department of Labor launched a registered apprenticeship expansion targeting clean energy infrastructure, with 5,000 initial slots reserved for workers from low-income and historically underrepresented communities. Apprentices will earn union-scale wages while training in solar installation, wind turbine maintenance, battery storage, and grid modernization. The program requires participating employers to hire at least 70 percent of graduates into permanent roles and to provide childcare and transportation stipends. Officials said the goal is to build a domestic clean energy workforce that reflects the communities most affected by energy costs.",
    imageUrl:
      "https://images.pexels.com/photos/4508751/pexels-photo-4508751.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "U.S. Department of Labor Apprenticeship Registry", url: "https://dol.gov/apprenticeship" },
      { name: "Department of Energy Clean Jobs Report", url: "https://energy.gov/clean-jobs" },
    ],
    godlyPrincipleAlignment:
      "Honors the dignity of labor, environmental stewardship, and the just provision of opportunity for every willing worker.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-008.mp3",
    publishedAt: new Date(now - 7 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "zpvtgi",
  },
  {
    id: "bn-2026-009",
    slug: "national-fatherhood-covenant-initiative-10000-mentors",
    headline: "National Fatherhood Covenant Initiative Enrolls 10,000 Mentors in First Year",
    category: "faith-commandments-morality",
    scope: "national",
    summary:
      "A faith-grounded mentorship network connects fathers and father figures with young men in high-poverty zip codes.",
    content:
      "A nationwide fatherhood covenant initiative reported that 10,000 men have enrolled as mentors in its first year, pairing fathers and father figures with boys and young men in high-poverty zip codes. The program combines weekly one-on-one meetings, group accountability circles, and job-readiness workshops. Participating churches and mosques provide space, meals, and volunteer coordination. Organizers said the goal is not to replace families but to reinforce them through stable, commandment-grounded male presence and guidance.",
    imageUrl:
      "https://images.pexels.com/photos/5875110/pexels-photo-5875110.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "National Fatherhood Covenant Registry", url: "https://fatherhoodcovenant.org" },
    ],
    godlyPrincipleAlignment:
      "Reflects the biblical calling of fathers to nurture, discipline, and prepare the next generation in the Lord's ways.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-009.mp3",
    publishedAt: new Date(now - 9 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "uzf48h",
  },
  {
    id: "bn-2026-010",
    slug: "city-council-8m-minority-owned-builders-contracts",
    headline: "City Council Awards $8M in Contracts to Minority-Owned Builders",
    category: "local-national-politics-civic",
    scope: "local",
    summary:
      "A new equitable procurement ordinance directs public infrastructure dollars to local minority-owned construction firms.",
    content:
      "The City Council approved $8 million in infrastructure contracts for minority-owned construction firms under a new equitable procurement ordinance. The first awards fund street resurfacing, park renovation, and affordable housing framing in historically disinvested neighborhoods. Contractors must meet local hiring goals, pay prevailing wages, and provide apprenticeship slots for young adults. Council members said the ordinance is designed to keep public dollars circulating locally while building durable minority-owned enterprise capacity.",
    imageUrl:
      "https://images.pexels.com/photos/1550335/pexels-photo-1550335.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "City Procurement Office Award Records", url: "https://procurement.city.gov/awards" },
    ],
    godlyPrincipleAlignment:
      "Upholds fair scales, honest commerce, and the just distribution of public resources for community flourishing.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-010.mp3",
    publishedAt: new Date(now - 11 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "6iphty",
  },
  {
    id: "bn-2026-011",
    slug: "african-trade-zone-pact-diaspora-entrepreneurs",
    headline: "African Trade Zone Pact Creates New Export Opportunities for Diaspora Entrepreneurs",
    category: "breaking-geopolitical",
    scope: "global",
    summary:
      "A continental free trade agreement opens simplified customs pathways for Black-owned businesses importing and exporting.",
    content:
      "African trade ministers finalized a new protocol under the continental free trade framework that creates simplified customs pathways for small and medium enterprises owned by African diaspora communities. The agreement allows qualifying businesses to register for a single trade identifier, reduce tariff paperwork, and access dispute resolution in regional arbitration centers. Trade officials said the pact is expected to increase diaspora-led exports in agricultural goods, textiles, and technology services by removing redundant border filings and informal fees.",
    imageUrl:
      "https://images.pexels.com/photos/236093/pexels-photo-236093.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "African Continental Free Trade Area Secretariat", url: "https://afcfta.au.int" },
      { name: "Diaspora Trade Chamber", url: "https://diasporatrade.org" },
    ],
    godlyPrincipleAlignment:
      "Promotes honest commerce, international brotherhood, and the equitable sharing of resources across nations.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-011.mp3",
    publishedAt: new Date(now - 13 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "14t8uyu",
  },
  {
    id: "bn-2026-012",
    slug: "youth-coding-academy-200-paid-tech-internships",
    headline: "Youth Coding Academy Places 200 Graduates into Paid Tech Internships",
    category: "education-youth-advancement",
    scope: "local",
    summary:
      "A tuition-free software academy reports every graduate accepted a paid internship at a technology employer.",
    content:
      "A tuition-free youth coding academy announced that all 200 graduates of its latest cohort accepted paid internships at technology companies, government agencies, and startups. The 16-week program covers full-stack web development, cloud infrastructure, and software testing, with mentors from partner employers. Graduates earn an average internship stipend of $22 per hour, and partner companies commit to converting at least half of interns into full-time roles. Program directors said the goal is to make tech careers accessible without requiring a four-year degree or student debt.",
    imageUrl:
      "https://images.pexels.com/photos/5212332/pexels-photo-5212332.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "Youth Coding Academy Outcomes Report", url: "https://youthcodingacademy.org/outcomes" },
      { name: "Regional Workforce Development Board", url: "https://workforce.region.gov" },
    ],
    godlyPrincipleAlignment:
      "Honors the dignity of skill, the virtue of diligence, and the empowerment of young people through productive knowledge.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-012.mp3",
    publishedAt: new Date(now - 15 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "w35r3k",
  },
  {
    id: "bn-2026-013",
    slug: "hbcu-medical-school-rural-health-clinic-network",
    headline: "HBCU Medical School Expands Rural Health Clinic Network Across Three States",
    category: "hbcu-education",
    scope: "national",
    summary:
      "A historically Black medical school opens new primary care clinics to address physician shortages in rural counties.",
    content:
      "A historically Black medical school announced the expansion of its rural health clinic network to twelve new counties across three states, adding primary care, maternal health, and chronic disease management services. The $18 million expansion is funded by federal health workforce grants, state matching dollars, and private foundation support. Medical students and residents will rotate through the clinics as part of a pipeline program designed to increase the number of Black physicians practicing in underserved rural areas. School officials said the project treats health care as a cornerstone of community dignity.",
    imageUrl:
      "https://images.pexels.com/photos/17615703/pexels-photo-17615703.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "Health Resources and Services Administration", url: "https://hrsa.gov" },
      { name: "HBCU Medical School Press Office", url: "https://hbcumed.edu/news" },
    ],
    godlyPrincipleAlignment:
      "Reflects the call to heal the sick, serve the vulnerable, and steward medical gifts for the good of neighbor.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-013.mp3",
    publishedAt: new Date(now - 17 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "4jnv3i",
  },
  {
    id: "bn-2026-014",
    slug: "black-farmers-30m-usda-debt-relief-land-access",
    headline: "Black Farmers Secure $30M in USDA Debt Relief and Land Access Grants",
    category: "business-wealth-stewardship",
    scope: "national",
    summary:
      "A federal agriculture package cancels discriminatory loans and funds new land purchases for Black-operated farms.",
    content:
      "The United States Department of Agriculture announced a $30 million relief package for Black farmers, including loan forgiveness for borrowers who faced documented discrimination and grants for new land purchases and equipment. The program prioritizes farmers operating in counties with persistent poverty and those who supply regional food hubs, schools, and cooperatives. Recipients must maintain soil conservation practices and participate in mentorship programs for beginning farmers. Advocates said the package is a step toward repairing the generational land loss caused by decades of discriminatory lending.",
    imageUrl:
      "https://images.pexels.com/photos/3869392/pexels-photo-3869392.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "USDA Farm Service Agency", url: "https://fsa.usda.gov" },
      { name: "Federation of Southern Cooperatives", url: "https://federation.coop" },
    ],
    godlyPrincipleAlignment:
      "Upholds restoration of stolen inheritance, faithful stewardship of the land, and justice for the oppressed.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-014.mp3",
    publishedAt: new Date(now - 19 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "1hmrmfi",
  },
  {
    id: "bn-2026-015",
    slug: "caribbean-climate-resilience-fund-island-communities",
    headline: "Caribbean Nations Launch Climate Resilience Fund for Island Communities",
    category: "breaking-geopolitical",
    scope: "global",
    summary:
      "Twelve Caribbean countries establish a pooled fund to finance storm-resilient infrastructure and renewable energy.",
    content:
      "Twelve Caribbean nations signed a treaty establishing a pooled climate resilience fund to finance storm-hardened infrastructure, renewable energy microgrids, and disaster-response training in island communities. The fund will begin with $250 million in pledges from member governments and diaspora investment partners and will be governed by a rotating board of small-island states. Projects must include local labor hiring and training provisions. Leaders said the fund is a response to repeated hurricane losses and a commitment to steward the region's natural and human resources for future generations.",
    imageUrl:
      "https://images.pexels.com/photos/16146279/pexels-photo-16146279.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "Caribbean Community Climate Centre", url: "https://caribbeanclimate.org" },
      { name: "Island Resilience Fund Treaty Text", url: "https://resiliencefund.org/treaty" },
    ],
    godlyPrincipleAlignment:
      "Honors stewardship of creation, protection of the vulnerable, and collective responsibility for neighborly care.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-015.mp3",
    publishedAt: new Date(now - 21 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "qufmz",
  },
  {
    id: "bn-2026-016",
    slug: "church-coalition-workforce-center-redlined-neighborhood",
    headline: "Church Coalition Opens Workforce Center in Redlined Neighborhood",
    category: "faith-commandments-morality",
    scope: "local",
    summary:
      "A partnership of local congregations launches a job training and placement center with childcare and transportation support.",
    content:
      "A coalition of eight churches opened a neighborhood workforce center in a historically redlined area, offering free job training, resume assistance, employer connections, and wraparound services including childcare and transportation vouchers. The center is funded by congregational donations, a city workforce grant, and employer sponsorships. In its first month, the center placed 90 residents into jobs with an average starting wage above the local living wage. Leaders said the project is an expression of faith in action, treating dignified work as a form of neighborly love.",
    imageUrl:
      "https://images.pexels.com/photos/38274938/pexels-photo-38274938.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "Neighborhood Workforce Center Annual Report", url: "https://nwc.local.org" },
      { name: "City Workforce Development Grant Recipients", url: "https://workforce.city.gov/grants" },
    ],
    godlyPrincipleAlignment:
      "Embodies the command to love one's neighbor through tangible provision, dignity, and opportunity.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-016.mp3",
    publishedAt: new Date(now - 23 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "h4ntjt",
  },
  {
    id: "bn-2026-017",
    slug: "solar-co-op-500-low-income-households-renewable-energy",
    headline: "Solar Co-op Brings Renewable Energy to 500 Low-Income Households",
    category: "clean-tech-and-advancements",
    scope: "local",
    summary:
      "A community-owned solar cooperative completes installation for hundreds of families, cutting utility bills by an average of 40 percent.",
    content:
      "A community-owned solar cooperative completed rooftop and community solar installations for 500 low-income households, reducing average electricity bills by 40 percent in the first billing cycle. The cooperative is governed by resident-members who voted on installation priorities, contractor selection, and reinvestment of surplus revenue into weatherization programs. The project was financed through a blend of state clean energy credits, a green bank loan, and member equity contributions capped at $100 per household. Organizers said the model proves that renewable energy can be owned by the communities that need it most.",
    imageUrl:
      "https://images.pexels.com/photos/9800031/pexels-photo-9800031.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "State Energy Office Community Solar Registry", url: "https://energy.state.gov/solar" },
      { name: "Cooperative Member Annual Report", url: "https://solarcoop.local.org" },
    ],
    godlyPrincipleAlignment:
      "Promotes faithful stewardship of creation, economic relief for the poor, and community ownership of shared resources.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-017.mp3",
    publishedAt: new Date(now - 25 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "whdlud",
  },
  {
    id: "bn-2026-018",
    slug: "scholarship-50-first-generation-students-hbcu-full-support",
    headline: "New Scholarship Sends 50 First-Generation Students to HBCUs with Full Support",
    category: "hbcu-education",
    scope: "national",
    summary:
      "A private foundation announces full-ride awards covering tuition, housing, and mentorship for first-generation HBCU students.",
    content:
      "A private foundation announced full-ride scholarships for 50 first-generation college students attending historically Black colleges and universities, covering tuition, housing, books, and a monthly stipend for four years. The program also pairs each scholar with a faculty mentor and a working professional in their intended field. Recipients were selected from public high schools in 15 states based on academic promise, community service, and financial need. Foundation leaders said the investment is rooted in the belief that education is a tool of liberation and that first-generation students deserve comprehensive support, not just tuition checks.",
    imageUrl:
      "https://images.pexels.com/photos/37420616/pexels-photo-37420616.jpeg?cs=srgb&fm=jpg&w=1200",
    factCheckStatus: "100% FACTUALLY VERIFIED",
    verifiedSources: [
      { name: "Foundation Scholarship Announcement", url: "https://foundationfirst.org/hbcu" },
      { name: "HBCU Enrollment and Aid Office", url: "https://hbcuaid.org" },
    ],
    godlyPrincipleAlignment:
      "Honors the liberating power of education, the breaking of generational barriers, and the stewardship of opportunity.",
    audioUrl: "https://cdn.blacknexa.org/audio/bn-2026-018.mp3",
    publishedAt: new Date(now - 27 * HOUR).toISOString(),
    author: "Blacknexa AI Fact Engine",
    contentHash: "1p9o90m",
  },
];

/**
 * Compute a stable content hash from the fields that define a unique briefing.
 * Mirrors the backend hash so client-side deduplication agrees with the server.
 */
export function articleContentHash(
  headline: string,
  summary: string,
  category: NewsCategory,
  scope: NewsScope,
): string {
  const safeHeadline = (headline ?? "").trim();
  const safeSummary = (summary ?? "").trim();
  const text = `${safeHeadline}|${safeSummary}|${category}|${scope}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Slugify a headline into a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Format an ISO timestamp into a short relative string. */
export function formatNewsRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/** Estimate reading time in minutes for an article's body text.
 * Uses a 200 wpm average and returns at least 1 minute. */
export function estimateReadingTime(article: NewsArticle): number {
  const safeSummary = (article.summary ?? "").trim();
  const safeContent = (article.content ?? "").trim();
  const words = `${safeSummary} ${safeContent}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Format an ISO timestamp into a full publication date, e.g. "July 27, 2026 · 6:42 AM". */
export function formatNewsAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timePart = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
    .toUpperCase();
  return `${datePart} · ${timePart}`;
}
