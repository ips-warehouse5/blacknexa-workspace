import type { IconName } from "@/components/icons/icon";

export const proofStats: { label: string; value: string; note: string }[] = [
  {
    label: "NEWS VERIFICATION",
    value: "3–5 sources",
    note: "behind every story, reviewed daily by our editorial team",
  },
  {
    label: "EVIDENCE",
    value: "Geo-stamped",
    note: "exact location, date, and time captured as you record",
  },
  {
    label: "STORAGE",
    value: "Encrypted vault",
    note: "heavily encrypted and built into the application",
  },
  {
    label: "DISPATCH",
    value: "Global routing",
    note: "local, state, national, and international authorities",
  },
];

export const coreValues: { label: string; icon: IconName }[] = [
  { label: "God first", icon: "faith" },
  { label: "Absolute truth", icon: "truth" },
  { label: "Moral integrity", icon: "integrity" },
];

export const services: { title: string; body: string; icon: IconName }[] = [
  {
    title: "Global Community Feed",
    body: "A worldwide social feed anchored in love and respect, with zero tolerance for vulgar language or ungoldy principles.",
    icon: "feed",
  },
  {
    title: "AI News Engine",
    body: "Verified daily news on Black business, technology, economic power, and faith, syndicated globally.",
    icon: "news",
  },
  {
    title: "Pocket Reporting Tool",
    body: "Geo-stamped incident reporting: record what is happening and capture the exact location, date, and time as it happens, building an unalterable paper trail.",
    icon: "geo",
  },
  {
    title: "Secure Evidence Vault",
    body: "Heavily encrypted storage where every record, date, and location is locked down.",
    icon: "vault",
  },
  {
    title: "Vetting & Direct Dispatch",
    body: "Verified reports route straight to legal teams, human rights organizations, civil rights agencies or press entities.",
    icon: "dispatch",
  },
  {
    title: "Civil Rights Resource Directory",
    body: "Positive, actionable civil rights resources matched to your location and your situation.",
    icon: "directory",
  },
];

export const benefits: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "You are never powerless",
    body: "Discrimination, bias, or misconduct can be documented on the spot, wherever it happens, in a peaceful and Godly manner.",
  },
  {
    n: "02",
    title: "Evidence that holds up",
    body: "Coordinates, date, and time are captured at the moment of recording and sealed, so the record cannot be quietly altered later.",
  },
  {
    n: "03",
    title: "Your report reaches the right desk",
    body: "Automated geographic research matches your incident to the authorities actually qualified to address it.",
  },
  {
    n: "04",
    title: "Decisions made on facts",
    body: "Every story carries three to five factual sources, so you are informed rather than caught out of the loop.",
  },
  {
    n: "05",
    title: "A community without the noise",
    body: "Connect, network, and build across borders in a space governed by love, respect, and God's word.",
  },
  {
    n: "06",
    title: "Your data stays yours",
    body: "Encrypted security is built into the application, and we never sell what you entrust to us.",
  },
];

export const whyChoose: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "God-centered by design",
    body: "Not a marketing line. Zero tolerance for vulgar language or ungoldy principles, and a community held to the greatest commandment: love your neighbor.",
  },
  {
    n: "02",
    title: "Legally protected platform",
    body: "Officially filed with the USPTO as a legally protected social media platform, so the technology our community depends on stays ours.",
  },
  {
    n: "03",
    title: "Verification, not opinion",
    body: "Three to five factual sources behind every story, reviewed daily by our editorial team, cutting straight through bias and confusion.",
  },
  {
    n: "04",
    title: "Built for global reach",
    body: "Automated AI geographic research connects users anywhere in the world with the local, state, national, and international authorities qualified to act.",
  },
  {
    n: "05",
    title: "Documentation and dispatch together",
    body: "Recording, geo-stamping, encrypted vaulting, and agency routing in one app, rather than four services that do not talk to each other.",
  },
];

export const securityPoints: { title: string; body: string; icon: IconName }[] =
  [
    {
      title: "USPTO filing",
      body: "Trademark-pending and officially filed as a legally protected social media platform.",
      icon: "trademark",
    },
    {
      title: "Encryption throughout",
      body: "Files are encrypted in transit and at rest inside the secure vault.",
      icon: "lock",
    },
    {
      title: "Sealed records",
      body: "Each record is hashed at creation so a recipient can confirm it has not been altered.",
      icon: "shield",
    },
    {
      title: "Moderated community",
      body: "Zero tolerance for vulgarity or abuse keeps the feed credible and safe to use.",
      icon: "eye",
    },
  ];

export const impactPoints: { title: string; body: string; icon: IconName }[] = [
  {
    title: "Patterns become visible",
    body: "Individual reports in one place reveal the repeat offenders, the repeat locations, and the repeat excuses.",
    icon: "rise",
  },
  {
    title: "Voices carry further together",
    body: "A community feed spanning Atlanta to Johannesburg means a local incident can be seen and supported globally.",
    icon: "users",
  },
  {
    title: "Accountability gets locked in",
    body: "Verified packages routed to the proper agencies create a paper trail that does not disappear.",
    icon: "dispatch",
  },
];

export const impactStats: { value: string; label: string; note: string }[] = [
  {
    value: "—",
    label: "MEMBERS WORLDWIDE",
    note: "Waitlist and member counts publish at launch.",
  },
  {
    value: "—",
    label: "REPORTS DOCUMENTED",
    note: "Sealed records created by the community.",
  },
  {
    value: "—",
    label: "AGENCIES REACHED",
    note: "Bodies that have received a verified package.",
  },
];

export const reportingSteps: {
  num: string;
  title: string;
  body: string;
  icon: IconName;
}[] = [
  {
    num: "01",
    icon: "geo",
    title: "Geo-Stamp Take Action",
    body: "Open the app, record what's happening with your camera, capture the exact location via our built-in geo-stamp reporting tool, and answer our quick, guided intake questions built right into the app to log the undeniable facts.",
  },
  {
    num: "02",
    icon: "vault",
    title: "Secure Vault",
    body: "Your evidence uploads instantly into a heavily encrypted secure vault where every record, date, and location is safely locked down.",
  },
  {
    num: "03",
    icon: "dispatch",
    title: "Vetting & Direct Dispatch",
    body: "Once verified through our careful vetting process, our trademark-pending technology service allows the system to securely route your report straight to the proper legal teams, human rights organizations, civil rights agencies, or press entities, with verified high-priority incidents pushed to the BlackNexa News Network (NOC) and independent media partners. Your voice is heard, the truth is documented, and accountability is locked in.",
  },
];

export const workflowExamples: { label: string; body: string }[] = [
  {
    label: "U.S. CONTEXT",
    body: "A user in the United States uses their phone camera to record an incident of workplace or civil rights discrimination, or police misconduct, uploads the secure media and details into the BlackNexa app evidence vault, and-once verified-the system routes the report directly to the proper domestic legal representation, civil rights organization, or enforcement agency.",
  },
  {
    label: "INTERNATIONAL CONTEXT",
    body: "A user in an underserved global community (e.g., in South Africa or another international region) records an incident, uploads it securely into the app, and-following verification-the system routes the report to the appropriate international human rights commission, local legal aid, or government oversight authority.",
  },
];

export const featureBlocks: {
  num: string;
  title: string;
  sub: string;
  body: string[];
  caption: string;
}[] = [
  {
    num: "01",
    title: "The Global Community Feed & Social Network",
    sub: "Like Facebook or X — built differently.",
    body: [
      "Think of BlackNexa as our own dedicated social media platform, featuring a vibrant, worldwide community feed. But this space is built differently-anchored entirely in love, respect, and God's word. There is zero tolerance for vulgar language or ungoldy principles here; everyone treats one another just as they want to be treated, fulfilling the greatest commandment to “Love our neighbor.”",
      "Just like Facebook or X, you can connect, network, share ideas, and grow together across borders. From discussing economic development, business ventures, job creation, and how to walk in an abundant life, to sharing what's happening right now from Atlanta, GA all the way to Johannesburg, South Africa-our global community comes together to build true, lasting power. (And this is only the beginning-more groundbreaking features are rolling out as our global family scales!)",
    ],
    caption: "Scrolling the worldwide feed, from Atlanta to Johannesburg.",
  },
  {
    num: "02",
    title: "The BlackNexa AI News Engine",
    sub: "Faith-Based Content & Truth in Motion",
    body: [
      "Never get caught sleeping or out of the loop. Our automated AI news engine cuts straight through the bias and confusion, delivering 100% verified daily news content straight to your phone and syndicated globally via blacknexa.com.",
      "Focusing entirely on what matters most for our growth-Black business, tech advancements, economic power, and rich, uplifting faith-based content centered on God's Word-every piece of news is backed by 3 to 5 factual sources and reviewed daily by our editorial team. It keeps our minds informed, sharp, and moving with divine wisdom to make smart decisions for our future.",
    ],
    caption: "Opening a story and its list of named, checkable sources.",
  },
  {
    num: "03",
    title:
      "Protection with Purpose: The Geo-Stamp Incident Reporting & Vetting Tool",
    sub: "Call it out wherever it happens. You are never powerless.",
    body: [
      "When discrimination, bias, or misconduct rears its ugly head-whether it's police profiling, housing discrimination, medical bias, or any other forms of discrimination-you don't have to stay silent. Call it out wherever it happens. You are never powerless. You now have a powerful, purpose-driven tool to document these events precisely where they take place and hold wrongdoers accountable in a peaceful, Godly manner.",
    ],
    caption:
      "Recording an incident as the geo-stamp locks the coordinates and time.",
  },
];

export const newsCategories: { title: string; body: string; icon: IconName }[] =
  [
    {
      title: "Black Business & Entrepreneurship",
      body: "Real growth, funding, and economic power.",
      icon: "wealth",
    },
    {
      title: "Technology & Innovation",
      body: "Staying ahead in the digital age.",
      icon: "tech",
    },
    {
      title: "Civic Engagement & Global Progress",
      body: "What it takes to build, protect, and scale worldwide.",
      icon: "civic",
    },
  ];

/** Used by ReferralSection (currently not rendered — see its doc comment). */
export const referralSteps: {
  num: string;
  title: string;
  body: string;
  icon: IconName;
}[] = [
  {
    num: "01",
    title: "Share your link",
    body: "Every waitlist member gets a personal invitation link the moment they register.",
    icon: "share",
  },
  {
    num: "02",
    title: "They join the movement",
    body: "Anyone who registers through your link is credited to you automatically.",
    icon: "users",
  },
  {
    num: "03",
    title: "You both move up",
    body: "Referrals move you and the people you bring higher up the early-access list.",
    icon: "rise",
  },
];
