/**
 * Location-matching lookup tables for the local news feed.
 *
 * Table contents are copied verbatim from the Worker's `_lib/local.ts`. They drive
 * token expansion when ranking articles against a reader's city, region and
 * country.
 *
 * ── Key-casing note ────────────────────────────────────────────────────────────
 * `US_STATE_NAMES` is keyed **uppercase** ("GA"), while `CITY_ALIASES` and
 * `NEARBY_CITIES` are keyed **lowercase** ("atlanta"). The Worker looked all three
 * up with `norm(city).toUpperCase()`, so the two lowercase tables never matched —
 * city-alias and nearby-city expansion were dead code, which meant the app's
 * "Nearby" toggle and the automatic thin-coverage fallback did nothing.
 *
 * The tables are left keyed as they were (they are the reference data) and the
 * lookup in `local_news.service.ts` normalises per table instead. See
 * `docs/MIGRATION_PLAN.md` §6.7.
 */

/** US state abbreviation → full name. Keyed UPPERCASE. */
export const US_STATE_NAMES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
  MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina",
  ND: "north dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania",
  RI: "rhode island", SC: "south carolina", SD: "south dakota", TN: "tennessee",
  TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west virginia", WI: "wisconsin", WY: "wyoming", DC: "district of columbia",
};

/** Well-known city aliases to broaden matching (e.g. NYC → "new york city"). Keyed lowercase. */
export const CITY_ALIASES: Record<string, string[]> = {
  "new york": ["new york city", "nyc", "manhattan", "brooklyn", "bronx", "queens"],
  "los angeles": ["la", "compton", "inglewood", "south la"],
  "chicago": ["chicago south side", "chicago west side"],
  "atlanta": ["atl", "decatur", "college park"],
  "houston": ["htx", "third ward", "fifth ward"],
  "detroit": ["motown", "midtown detroit"],
  "washington": ["dc", "district of columbia", "anacostia"],
  "new orleans": ["nola", "treme", "ninth ward"],
  "memphis": ["orange mound"],
  "birmingham": ["magic city"],
  "oakland": ["the town", "east oakland"],
  "philadelphia": ["philly", "north philly", "west philly"],
  "baltimore": ["charm city"],
  "cleveland": ["the land"],
  "st louis": ["saint louis"],
  "miami": ["liberty city", "overtown", "little haiti"],
  "charlotte": ["queen city"],
  "nashville": ["music city"],
};

/**
 * Adjacent/nearby cities for major Black-population centers. Used by the
 * Nearby toggle and the automatic thin-coverage fallback so readers see
 * stories from their broader metro region when their own city has fewer
 * than three local briefings.
 */
export const NEARBY_CITIES: Record<string, string[]> = {
  "new york": ["newark", "jersey city", "yonkers", "bridgeport", "trenton"],
  "los angeles": ["long beach", "pasadena", "compton", "inglewood", "torrance"],
  "chicago": ["gary", "evanston", "oak park", "aurora", "joliet"],
  "atlanta": ["decatur", "college park", "marietta", "sandy springs", "east point"],
  "houston": ["pasadena", "galveston", "sugar land", "baytown", "pearland"],
  "detroit": ["dearborn", "pontiac", "warren", "hamtramck", "highland park"],
  "washington": ["arlington", "alexandria", "silver spring", "hyattsville", "baltimore"],
  "new orleans": ["metairie", "kenner", "baton rouge", "gretna", "algiers"],
  "memphis": ["west memphis", "collierville", "bartlett", "germantown", "millington"],
  "birmingham": ["homewood", "hoover", "bessemer", "vestavia hills", "fairfield"],
  "oakland": ["san francisco", "berkeley", "richmond", "hayward", "fremont"],
  "philadelphia": ["camden", "chester", "upper darby", "norristown", "wilmington"],
  "baltimore": ["towson", "columbia", "annapolis", "dundalk", "catonsville"],
  "cleveland": ["akron", "lorain", "euclid", "mentor", "parma"],
  "st louis": ["east saint louis", "ferguson", "florissant", "university city", "kirkwood"],
  "miami": ["fort lauderdale", "halleandale beach", "north miami", "coral gables", "liberty city"],
  "charlotte": ["concord", "gastonia", "rock hill", "matthews", "huntersville"],
  "nashville": ["antioch", "franklin", "hendersonville", "murfreesboro", "la vergne"],
  "dallas": ["fort worth", "arlington", "garland", "irving", "plano"],
  "jacksonville": ["orange park", "st augustine", "middleburg", "nasville", "fernandina beach"],
  "milwaukee": ["waukesha", "racine", "kenosha", "west allis", "greenfield"],
  "kansas city": ["independence", "overland park", "kansas city kansas", "lees summit", "liberty"],
  "indianapolis": ["lawrence", "southport", "beech grove", "carmel", "fishers"],
  "columbus": ["delaware", "westerville", "grove city", "reynoldsburg", "circleville"],
  "jackson": ["byram", "ridgeland", "madison", "pearl", "flowood"],
  "little rock": ["north little rock", "conway", "jacksonville", "maumelle", "benton"],
};
