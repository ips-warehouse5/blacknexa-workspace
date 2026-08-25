-- Extensions the report module needs.
--
--   pg_trgm       — orders the candidates behind screen B6's "Did you mean …?"
--   fuzzystrmatch — Levenshtein, which is what actually finds the typo: the
--                   design's own example (utcia → utica) is a transposition and
--                   scores only 0.2 on trigrams, but 2 on edit distance.
--   unaccent      — so a search for "Cafe" matches "Café"
--   postgis   — optional. The location code has a lat/lng + geohash fallback and
--               does not require it; it is enabled here because the image ships
--               it and having it available costs nothing.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS postgis;
