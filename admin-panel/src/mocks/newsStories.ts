/**
 * News stories.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { NewsStory } from "@/mocks/types";

export const newsStories: NewsStory[] = [
  {
    id: "NWS-101",
    title:
      "Global African Diaspora Investment Summit Announces $50M Tech Fund",
    summary:
      "A consortium of African and Caribbean angel syndicates unveiled a joint early-stage venture fund focused on diaspora-led fintech and supply chain startups.",
    body: "The inaugural African & Caribbean Tech Synergy Summit concluded in London today with the formal closing of a $50 million investment vehicle aimed at scaling high-growth startups across Lagos, Nairobi, London, and Kingston. Organizers emphasized that the cross-border fund will prioritize founders developing cross-continental remittances, cold-chain agricultural logistics, and decentralized legal-tech infrastructures. Co-sponsored by international institutional partners, the fund will begin accepting initial seed applications starting next quarter.",
    category: "Wealth & Business",
    scope: "Global",
    location: "London, UK / Lagos, Nigeria",
    language: "en-US",
    languageLabel: "🇺🇸 English (United States)",
    audioVoice: "Natural AI Anchor (Studio US)",
    audioDuration: "0m 52s",
    audioUrl: "https://cdn.blacknexa.org/audio/news/NWS-101-en-US.mp3",
    audioStatus: "Ready",
    chars: 584,
    status: "Published",
    verified: true,
    dailyBriefing: true,
    seoIndexed: true,
    image:
      "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&auto=format&fit=crop&q=80",
    publishedDate: "Sep 02, 2026 08:30 AM",
    sources: [
      {
        name: "Reuters Global Finance",
        url: "https://reuters.com",
        credibility: "Tier 1 Wire",
      },
      {
        name: "Financial Times Diaspora Tech",
        url: "https://ft.com",
        credibility: "Verified Editorial",
      },
      {
        name: "TechCabal Africa",
        url: "https://techcabal.com",
        credibility: "Primary Tech Source",
      },
      {
        name: "Caribbean Business Report",
        url: "https://caribbeanbusiness.com",
        credibility: "Regional Verified",
      },
    ],
  },
  {
    id: "NWS-102",
    title:
      "Atlanta City Council Approves Landmark Community Defense & Rights Initiative",
    summary:
      "Municipal lawmakers passed a $14M grant package bolstering mobile legal assistance and rapid civil rights documentation for working families.",
    body: "In a decisive 12–2 vote on Tuesday afternoon, the Atlanta City Council ratified the Urban Civil Protection Ordinance, securing $14.2 million in dedicated public funding to support grassroots legal clinics and mobile rights transparency apps. The legislation establishes neighborhood legal help desks across Southwest Atlanta and guarantees immediate free counsel for residents involved in municipal code disputes and unlawful detentions. Community leaders praised the initiative as a decisive blueprint for metropolitan justice reform.",
    category: "Civic & Justice",
    scope: "Local",
    location: "Atlanta, GA",
    language: "en-US",
    languageLabel: "🇺🇸 English (United States)",
    audioVoice: "Natural AI Anchor (Studio US)",
    audioDuration: "0m 48s",
    audioUrl: "https://cdn.blacknexa.org/audio/news/NWS-102-en-US.mp3",
    audioStatus: "Ready",
    chars: 569,
    status: "Published",
    verified: true,
    dailyBriefing: true,
    seoIndexed: true,
    image:
      "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop&q=80",
    publishedDate: "Sep 02, 2026 07:15 AM",
    sources: [
      {
        name: "Atlanta Journal-Constitution",
        url: "https://ajc.com",
        credibility: "Regional Primary",
      },
      {
        name: "Associated Press",
        url: "https://apnews.com",
        credibility: "Tier 1 Wire",
      },
      {
        name: "WABE 90.1 Public Radio",
        url: "https://wabe.org",
        credibility: "Local Verified",
      },
    ],
  },
  {
    id: "NWS-103",
    title:
      "HBCU Engineering Consortium Launches Quantum AI & STEM Fellowship",
    summary:
      "Five leading Historically Black Universities have partnered with federal research labs to sponsor 250 fully funded graduate research fellowships.",
    body: "A coalition comprising Howard, Morehouse, Spelman, Florida A&M, and North Carolina A&T universities announced the launch of the National Quantum and Applied AI Fellowship today. Supported by a national science endowment, the multi-year curriculum offers 250 undergraduate and doctoral scholars direct mentorship with leading supercomputing centers. Fellows will focus on ethical algorithmic governance, medical diagnostics, and decentralized encryption frameworks designed to protect vulnerable digital records.",
    category: "Education & Tech",
    scope: "National",
    location: "United States",
    language: "en-US",
    languageLabel: "🇺🇸 English (United States)",
    audioVoice: "Natural AI Anchor (Studio US)",
    audioDuration: "0m 50s",
    audioUrl: "https://cdn.blacknexa.org/audio/news/NWS-103-en-US.mp3",
    audioStatus: "Ready",
    chars: 566,
    status: "Approved",
    verified: true,
    dailyBriefing: true,
    seoIndexed: true,
    image:
      "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80",
    publishedDate: "Sep 01, 2026 04:20 PM",
    sources: [
      {
        name: "Diverse: Issues In Higher Education",
        url: "https://diverseeducation.com",
        credibility: "Academic Primary",
      },
      {
        name: "National Science Foundation Wire",
        url: "https://nsf.gov",
        credibility: "Government Primary",
      },
      {
        name: "Black Enterprise Tech",
        url: "https://blackenterprise.com",
        credibility: "Verified Media",
      },
    ],
  },
  {
    id: "NWS-104",
    title:
      "Chicago Urban Health Collective Expands Preventative Maternal Wellness Network",
    summary:
      "New mobile clinics and doula telehealth networks roll out across South and West Chicago neighborhoods to reduce maternal mortality disparities.",
    body: "The Illinois Department of Public Health joined community doula networks in Chicago this morning to inaugurate a comprehensive maternal health fleet. The program features five specialized mobile care units equipped with ultrasound diagnostics and real-time telehealth consults with certified obstetricians. Program directors noted that the initiative aims to provide continuous postpartum monitoring to more than 3,500 expectant mothers across Cook County over the next twelve months.",
    category: "Health & Wellness",
    scope: "Local",
    location: "Chicago, IL",
    language: "en-US",
    languageLabel: "🇺🇸 English (United States)",
    audioVoice: "Natural AI Anchor (Studio US)",
    audioDuration: "0m 47s",
    audioUrl: "https://cdn.blacknexa.org/audio/news/NWS-104-en-US.mp3",
    audioStatus: "Ready",
    chars: 554,
    status: "Pending Review",
    verified: true,
    dailyBriefing: false,
    seoIndexed: true,
    image:
      "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop&q=80",
    publishedDate: "Sep 02, 2026 09:10 AM",
    sources: [
      {
        name: "Chicago Tribune Metro",
        url: "https://chicagotribune.com",
        credibility: "Regional Primary",
      },
      {
        name: "Illinois Department of Public Health",
        url: "https://dph.illinois.gov",
        credibility: "Government Source",
      },
      {
        name: "American Medical Association News",
        url: "https://ama-assn.org",
        credibility: "Medical Tier 1",
      },
    ],
  },
  {
    id: "NWS-105",
    title:
      "Kingston Creative Hub Expands Caribbean Intellectual Property & Music Registry",
    summary:
      "Jamaican creative advocates establish automated digital provenance tracking for reggae, dancehall, and visual artists across the global market.",
    body: "The Ministry of Culture, Gender, Entertainment and Sport in Kingston launched an open digital catalog aimed at protecting the copyrights of independent Caribbean songwriters and digital creators. The registry leverages cryptographically signed timestamps to safeguard musical works against unauthorized commercial exploitation and non-consensual AI model training. International streaming aggregators have agreed to integrate direct licensing protocols with the new database starting in late autumn.",
    category: "Arts & Culture",
    scope: "Diaspora",
    location: "Kingston, Jamaica",
    language: "en-US",
    languageLabel: "🇺🇸 English (United States)",
    audioVoice: "Natural AI Anchor (Studio US)",
    audioDuration: "0m 51s",
    audioUrl: "https://cdn.blacknexa.org/audio/news/NWS-105-en-US.mp3",
    audioStatus: "Ready",
    chars: 585,
    status: "Pending Review",
    verified: true,
    dailyBriefing: false,
    seoIndexed: true,
    image:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80",
    publishedDate: "Sep 02, 2026 08:45 AM",
    sources: [
      {
        name: "Jamaica Gleaner Entertainment",
        url: "https://jamaica-gleaner.com",
        credibility: "National Newspaper",
      },
      {
        name: "Billboard International",
        url: "https://billboard.com",
        credibility: "Industry Authority",
      },
      {
        name: "Caribbean Community (CARICOM) News",
        url: "https://caricom.org",
        credibility: "Regional Intergovernmental",
      },
    ],
  },
  {
    id: "NWS-106",
    title:
      "National Black Chamber of Commerce Reports Record Micro-Enterprise Loan Deployments",
    summary:
      "Community Development Financial Institutions deployed over $210M in low-interest working capital to small storefronts in Q2 2026.",
    body: "A comprehensive economic benchmark released by the National Black Chamber of Commerce indicates a 28% year-over-year surge in micro-loan originations for small retail and service enterprises. Backed by expanded federal guarantees, more than 4,200 small businesses secured operating capital without onerous collateral requirements. Economists noted that repayment rates on community-managed micro-facilities remain above 96%, outperforming traditional commercial banking metrics.",
    category: "Wealth & Business",
    scope: "National",
    location: "United States",
    language: "en-US",
    languageLabel: "🇺🇸 English (United States)",
    audioVoice: "Natural AI Anchor (Studio US)",
    audioDuration: "0m 49s",
    audioUrl: "https://cdn.blacknexa.org/audio/news/NWS-106-en-US.mp3",
    audioStatus: "Ready",
    chars: 556,
    status: "Approved",
    verified: true,
    dailyBriefing: true,
    seoIndexed: true,
    image:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80",
    publishedDate: "Sep 01, 2026 02:00 PM",
    sources: [
      {
        name: "Bloomberg Markets",
        url: "https://bloomberg.com",
        credibility: "Tier 1 Wire",
      },
      {
        name: "National Black Chamber Briefing",
        url: "https://nationalbcc.org",
        credibility: "Industry Primary",
      },
      {
        name: "Wall Street Journal Small Business",
        url: "https://wsj.com",
        credibility: "Verified Financial",
      },
    ],
  },
];

export default newsStories;
