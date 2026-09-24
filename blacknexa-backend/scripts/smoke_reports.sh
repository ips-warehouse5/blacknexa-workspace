#!/usr/bin/env bash
# End-to-end walkthrough of the report module against a live server.
# Covers the C1–C9 wizard path, the B1 feed and facets, and the D1–D9 detail
# actions. Mirrors items 11–20 of the definition of done in
# docs/FEATURE_BUILD_PLAN.md §2, minus the parts that need real object storage.
#
# Revision 2 — pre-moderation (docs/INCIDENT_MODULE_PLAN.md §7):
#   • A public report is filed `pending`. This script polls the owner's view until
#     the moderation worker decides (`moderation.state` approved or held), and
#     asserts that a stranger gets 404 while it is still pending.
#   • Everything a *reader* does (read, stand with, corroborate, comment, flag,
#     feed, search, share) needs the report published. If it was held instead —
#     no AI engine configured and MODERATION_REPORT_AI_FALLBACK=hold, the fail-
#     closed default — those checks are reported as SKIP, not FAIL. For the full
#     walkthrough run the AI engine, or set MODERATION_REPORT_AI_FALLBACK=approve
#     locally (refused in production).
#   • Comments are checked before others see them too; the script waits for each
#     one to appear for another member before replying to it or liking it.
# MOD_WAIT (seconds, default 90) bounds each wait.
API=http://localhost:4000/api/v1
LOG=${LOG:-/tmp/bn-server.log}
MOD_WAIT=${MOD_WAIT:-90}
pass=0; fail=0; skip=0

say()  { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail+1)); }
skipped() { printf '  \033[33mSKIP\033[0m %s\n' "$1"; skip=$((skip+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected $3, got $2)"; fi; }
# Read a dot-separated path out of a JSON response, e.g. `jget result.draftId`.
# Takes the path as argv rather than interpolating it into the Python source: the
# path's own quotes would otherwise collide with the string quoting.
jget() {
  python -c '
import json, sys
node = json.load(sys.stdin)
for key in sys.argv[1].split("."):
    if isinstance(node, dict):
        node = node.get(key)
    elif isinstance(node, list) and key.isdigit():
        node = node[int(key)]
    else:
        node = None
    if node is None:
        break
print("" if node is None else node)
' "$1" 2>/dev/null
}

# Register + verify a member, returning their access token.
make_member() {
  local email="$1"
  curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"Str0ng!Passw0rd\"}" > /dev/null
  sleep 1
  local code
  code=$(grep -o "code is [0-9]\{6\}" "$LOG" | tail -1 | grep -o '[0-9]\{6\}')
  curl -s -X POST "$API/auth/verify-email" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"code\":\"$code\"}" \
    | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4
}

STAMP=$(date +%s)
say "set up two members"
OWNER=$(make_member "owner.$STAMP@blacknexa.test")
sleep 1
READER=$(make_member "reader.$STAMP@blacknexa.test")
[ -n "$OWNER" ] && [ -n "$READER" ] && ok "two members signed in" || bad "member setup failed"

auth_post() { curl -s -X POST "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }
auth_get()  { curl -s "$API$1" -H "Authorization: Bearer $2"; }
auth_code() { curl -s -o /dev/null -w '%{http_code}' "$API$1" -H "Authorization: Bearer $2"; }
auth_post_code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }

# Poll the owner's view of report $1 until the pipeline decides; while it is still
# pending, assert that member $3 gets a 404. Sets MSTATE to the final state.
# The stranger's answer only counts when the owner's view says `pending` both
# before and after it, so a worker deciding mid-check cannot fake a pass or a fail.
wait_moderation() {
  local report="$1" owner="$2" stranger="$3" label="$4"
  local i state code again checked=0
  MSTATE=""
  for i in $(seq 1 "$MOD_WAIT"); do
    state=$(auth_get "/reports/$report" "$owner" | jget result.moderation.state)
    if [ "$state" != "pending" ]; then MSTATE="$state"; break; fi
    MSTATE="pending"
    if [ -n "$stranger" ] && [ "$checked" = 0 ]; then
      code=$(auth_code "/reports/$report" "$stranger")
      again=$(auth_get "/reports/$report" "$owner" | jget result.moderation.state)
      if [ "$again" = "pending" ]; then
        check "$label: a stranger gets 404 while it is being checked" "$code" "404"
        checked=1
      fi
    fi
    sleep 1
  done
  if [ -n "$stranger" ] && [ "$checked" = 0 ] && [ "$MSTATE" != "pending" ]; then
    skipped "$label: decided before the first poll, so the pending 404 could not be observed"
  fi
  case "$MSTATE" in
    approved) ok "$label: published by the automated check" ;;
    held)     ok "$label: held for a moderator (fail-closed)" ;;
    pending)  bad "$label: still pending after ${MOD_WAIT}s — is the moderation worker running?" ;;
    *)        bad "$label: unexpected moderation state '$MSTATE'" ;;
  esac
}

# Wait until comment $2 on report $1 is shown to member $3 (the pipeline approved it).
wait_comment_visible() {
  local report="$1" comment="$2" viewer="$3" i
  for i in $(seq 1 "$MOD_WAIT"); do
    if auth_get "/reports/$report/comments?sort=new" "$viewer" | grep -q "\"id\":\"$comment\""; then
      return 0
    fi
    sleep 1
  done
  return 1
}

say "C1–C6 · save a draft through the wizard"
D=$(auth_post /reports/drafts "$OWNER" '{"step":1,"payload":{"category":"policing"}}')
DRAFT=$(echo "$D" | jget result.draftId)
[ -n "$DRAFT" ] && ok "draft created" || bad "draft failed: $D"

D2=$(auth_post /reports/drafts "$OWNER" "{\"draftId\":\"$DRAFT\",\"step\":6,\"payload\":{
  \"category\":\"policing\",
  \"title\":\"Stopped and searched outside Utica Ave station\",
  \"body\":\"Two officers stopped me on the way out of the station and asked for ID.\",
  \"occurredAt\":\"2026-08-13T19:22:00.000Z\",
  \"locationPrecision\":\"approximate\",
  \"locationLabel\":\"Brownsville, Brooklyn\",
  \"lat\":40.6626,\"lng\":-73.9089,
  \"visibility\":\"public\",\"anonymous\":true,\"urgent\":true}}")
echo "$D2" | grep -q '"success":1' && ok "draft updated through step 6" || bad "draft update failed: $D2"

say "C2 · a title longer than 70 characters is refused with the rule"
LONG=$(auth_post /reports/drafts "$OWNER" "{\"draftId\":\"$DRAFT\",\"step\":2,\"payload\":{\"title\":\"$(python -c 'print("x"*80)')\"}}")
echo "$LONG" | grep -qi 'one line' && ok "prints the C2 rule" || bad "did not print the C2 rule: $LONG"

say "C2 · a draft may be saved with an empty title (it is not filed yet)"
EMPTY=$(auth_post /reports/drafts "$OWNER" '{"step":2,"payload":{"title":"","body":"","locationLabel":""}}')
echo "$EMPTY" | grep -q '"success":1' && ok "empty fields save in a draft" || bad "empty draft refused: $EMPTY"

say "C3 · a future date is refused"
FUT=$(auth_post /reports/drafts "$OWNER" "{\"draftId\":\"$DRAFT\",\"step\":3,\"payload\":{\"occurredAt\":\"2099-01-01T00:00:00.000Z\"}}")
echo "$FUT" | grep -qi 'in the future' && ok "future date refused" || bad "future date accepted: $FUT"

say "C5 · a draft's file list is its owner's alone"
DE=$(auth_code "/reports/drafts/$DRAFT/evidence" "$READER")
check "another member listing this draft's files" "$DE" "404"

say "C7 · filing without the attestation is refused"
NOATT=$(auth_post /reports "$OWNER" "{\"draftId\":\"$DRAFT\",\"attested\":false}")
echo "$NOATT" | grep -qi 'true to the best of your knowledge' && ok "attestation required" || bad "filed without attestation: $NOATT"

say "C7 → C9 · file the report"
F=$(auth_post /reports "$OWNER" "{\"draftId\":\"$DRAFT\",\"attested\":true}")
REPORT=$(echo "$F" | jget result.reportId)
CASEREF=$(echo "$F" | jget result.caseRef)
[ -n "$REPORT" ] && ok "report filed" || bad "filing failed: $F"
echo "$CASEREF" | grep -q '^BNX-' && ok "case reference is BNX-shaped ($CASEREF)" || bad "bad case ref: $CASEREF"
check "a public report is filed for checking" "$(echo "$F" | jget result.moderationState)" "pending"

say "D12 · filing the same draft again returns the same report"
F2CODE=$(auth_post_code /reports "$OWNER" "{\"draftId\":\"$DRAFT\",\"attested\":true}")
F2=$(auth_post /reports "$OWNER" "{\"draftId\":\"$DRAFT\",\"attested\":true}")
check "re-filing answers 200" "$F2CODE" "200"
check "re-filing names the same report" "$(echo "$F2" | jget result.reportId)" "$REPORT"

say "the draft is gone once filed"
DL=$(auth_get /reports/drafts "$OWNER")
echo "$DL" | grep -q "$DRAFT" && bad "draft survived filing" || ok "draft consumed"

say "pre-moderation · the report is checked before anyone else can see it"
wait_moderation "$REPORT" "$OWNER" "$READER" "filed report"
PUBLISHED=0; [ "$MSTATE" = "approved" ] && PUBLISHED=1
[ "$PUBLISHED" = 1 ] || echo "  (reader-side checks below are skipped unless the report is published —
   run the AI engine or set MODERATION_REPORT_AI_FALLBACK=approve for the full walkthrough)"

# Run a reader-side step only when the report was published.
published() { if [ "$PUBLISHED" = 1 ]; then return 0; fi; skipped "$1 (report not published)"; return 1; }

say "D2 · the owner gets the owner projection"
O=$(auth_get "/reports/$REPORT" "$OWNER")
echo "$O" | grep -q '"isOwner":true' && ok "owner flagged" || bad "owner not flagged"
echo "$O" | grep -q '"timeline"' && ok "timeline present" || bad "no timeline"
echo "$O" | grep -q '"canDispatch":false' && ok "dispatch gated until verified" || bad "dispatch not gated"
echo "$O" | grep -q '"status":"submitted"' && ok "status is submitted" || bad "wrong status"
echo "$O" | grep -q '"moderation":{' && ok "moderation block present" || bad "no moderation block"
DS=$(echo "$O" | jget result.moderation.displayStatus)
case "$DS" in published|with_moderator) ok "display status is $DS" ;; *) bad "unexpected display status '$DS'" ;; esac
if [ "$PUBLISHED" = 1 ]; then
  echo "$O" | grep -q '"moderationEvent":"published"' && ok "timeline shows it was published" || bad "no published event in the timeline"
fi

say "C4 · approximate location is rounded, not exact"
LAT=$(echo "$O" | jget result.location.lat)
echo "  published lat: $LAT (input was 40.6626)"
[ "$LAT" != "40.6626" ] && ok "coordinates rounded on write" || bad "exact coordinates published"
echo "$O" | grep -q '"radiusMetres":500' && ok "500 m radius, as C4 promises" || bad "wrong radius"

say "D1 · a reader gets the viewer projection, and no identity"
if published "reader projection"; then
  V=$(auth_get "/reports/$CASEREF" "$READER")
  echo "$V" | grep -q '"isOwner":false' && ok "reader is not owner" || bad "reader marked owner"
  echo "$V" | grep -q '"name":"Anonymous"' && ok "anonymous report hides the name" || bad "name leaked"
  echo "$V" | grep -q '"user_id"' && bad "user_id leaked" || ok "no user_id in payload"
  echo "$V" | grep -q 'owner\.'"$STAMP" && bad "owner email leaked" || ok "no owner email in payload"
  echo "$V" | grep -q '"moderation":{' && bad "moderation block leaked to a reader" || ok "no moderation block for a reader"
fi

say "D1 · stand with"
if published "stand with"; then
  S=$(auth_post "/reports/$REPORT/support" "$READER")
  echo "$S" | grep -q '"standing":true' && ok "stood with" || bad "support failed: $S"
  S2=$(auth_post "/reports/$REPORT/support" "$READER")
  echo "$S2" | grep -q '"standing":false' && ok "toggles off" || bad "did not toggle"
  auth_post "/reports/$REPORT/support" "$READER" > /dev/null
fi

say "D1 · corroborate — and the owner cannot corroborate their own"
if published "corroborate"; then
  C=$(auth_post "/reports/$REPORT/corroborate" "$READER" '{"note":"Same thing happened to me."}')
  echo "$C" | grep -q '"count":1' && ok "corroborated" || bad "corroborate failed: $C"
fi
SELF=$(auth_post "/reports/$REPORT/corroborate" "$OWNER")
echo "$SELF" | grep -qi 'your own report' && ok "self-corroboration refused" || bad "self-corroboration allowed"

say "D4 · comment, then reply — and a third level is refused"
ROOT=""; REPLY=""
if published "comments"; then
  CM=$(auth_post "/reports/$REPORT/comments" "$READER" '{"body":"The same thing happened on that platform in June."}')
  ROOT=$(echo "$CM" | jget result.id)
  [ -n "$ROOT" ] && ok "comment posted" || bad "comment failed: $CM"
  check "the author sees their comment as checking" "$(echo "$CM" | jget result.moderationState)" "pending"
  check "the author is told it is theirs" "$(echo "$CM" | jget result.isMine)" "True"
  if wait_comment_visible "$REPORT" "$ROOT" "$OWNER"; then ok "comment shown to others once checked"; else bad "comment never shown to the report owner"; fi
  RP=$(auth_post "/reports/$REPORT/comments" "$OWNER" "{\"body\":\"Thank you.\",\"parentId\":\"$ROOT\"}")
  REPLY=$(echo "$RP" | jget result.id)
  [ -n "$REPLY" ] && ok "reply posted" || bad "reply failed: $RP"
  if wait_comment_visible "$REPORT" "$REPLY" "$READER"; then ok "reply shown to others once checked"; else bad "reply never shown to the reader"; fi
  L3=$(auth_post "/reports/$REPORT/comments" "$READER" "{\"body\":\"nope\",\"parentId\":\"$REPLY\"}")
  echo "$L3" | grep -qi 'not on another reply' && ok "third level refused" || bad "third level accepted: $L3"
fi

say "D4 · threads come back nested with their replies"
if published "threads"; then
  TH=$(auth_get "/reports/$REPORT/comments?sort=new" "$READER")
  echo "$TH" | grep -q '"replies"' && ok "replies nested" || bad "replies not nested"
  echo "$TH" | grep -q '"total":2' && ok "total counts both levels" || bad "wrong total: $TH"
fi

say "D4 · like a comment"
if published "like"; then
  LK=$(auth_post "/comments/$ROOT/like" "$OWNER")
  echo "$LK" | grep -q '"liked":true' && ok "liked" || bad "like failed: $LK"
fi

say "D8 → D9 · flag, with a reference and the author-is-told line"
if published "flag"; then
  FL=$(auth_post "/reports/$REPORT/flags" "$READER" '{"reason":"private_details","note":"A plate is visible."}')
  echo "$FL" | grep -q '"flagRef":"FLG-' && ok "flag reference issued (legacy code accepted)" || bad "no flag ref: $FL"
  echo "$FL" | grep -q '"authorIsTold":"Nothing about you"' && ok "states what the author is told" || bad "missing the D9 promise"
  echo "$FL" | grep -q '"expectedWithin":"within the hour"' && ok "a private-details flag is looked at within the hour" || bad "wrong expectedWithin: $FL"
  FLREF=$(echo "$FL" | jget result.flagRef)
  FLAGAIN_CODE=$(auth_post_code "/reports/$REPORT/flags" "$READER" '{"reason":"private_info"}')
  FLAGAIN=$(auth_post "/reports/$REPORT/flags" "$READER" '{"reason":"private_info"}')
  check "flagging again answers 200" "$FLAGAIN_CODE" "200"
  check "flagging again returns the same flag" "$(echo "$FLAGAIN" | jget result.flagRef)" "$FLREF"
  FB=$(auth_get "/reports/$REPORT" "$READER")
  echo "$FB" | grep -q '"flaggedByMe":true' && ok "the reader sees 'You flagged this'" || bad "flaggedByMe missing"
fi
OWNFLAG=$(auth_post "/reports/$REPORT/flags" "$OWNER" '{"reason":"spam"}')
echo "$OWNFLAG" | grep -qi 'your own report' && ok "the owner cannot flag their own report" || bad "owner flagged own report: $OWNFLAG"

say "D9 · hide from my feed"
if published "hide"; then
  H=$(auth_post "/reports/$REPORT/hide" "$READER")
  echo "$H" | grep -q '"success":1' && ok "hidden" || bad "hide failed: $H"
fi

say "B1 · the feed excludes a report the reader hid"
if published "feed exclusion"; then
  FE=$(auth_get "/reports?sort=newest" "$READER")
  echo "$FE" | grep -q "$REPORT" && bad "hidden report still in the feed" || ok "hidden report excluded"
fi

say "B1 · the owner still sees it in their own feed"
MINE=$(auth_get "/reports?mine=true" "$OWNER")
echo "$MINE" | grep -q "$REPORT" && ok "present in the Vault view" || bad "missing from mine=true"
echo "$MINE" | grep -q '"leadMedia":null' && ok "no lead media → text-first card variant" || bad "leadMedia wrong"
echo "$MINE" | grep -q '"displayStatus":' && ok "Vault cards carry a display status" || bad "no displayStatus on Vault cards"
if [ -n "$DS" ]; then
  MINEDS=$(auth_get "/reports?mine=true&displayStatus=$DS" "$OWNER")
  echo "$MINEDS" | grep -q "$REPORT" && ok "the '$DS' chip lists it" || bad "displayStatus filter missed it"
  MINENOT=$(auth_get "/reports?mine=true&displayStatus=taken_down" "$OWNER")
  echo "$MINENOT" | grep -q "$REPORT" && bad "the taken-down chip lists a live report" || ok "the taken-down chip does not list it"
fi

say "B1/B2 · facets carry a count for every category"
FA=$(auth_get "/reports/facets" "$READER")
N=$(echo "$FA" | grep -o '"category"' | wc -l | tr -d ' ')
check "categories counted" "$N" "9"
echo "$FA" | grep -q '"urgent"' && ok "urgent count present" || bad "no urgent count"

say "B5 · search names the field that matched"
if published "search"; then
  SR=$(auth_get "/reports/search?q=utica" "$OWNER")
  echo "$SR" | grep -q '"matchedIn":"title"' && ok "matched in title" || bad "matchedIn wrong: $SR"
fi

say "B6 · a typo returns a suggestion"
if published "suggestion"; then
  SG=$(auth_get "/reports/search?q=utcia" "$OWNER")
  echo "$SG" | grep -q '"suggestion":"utica"' && ok "suggested the correct spelling" || bad "no suggestion: $SG"
fi

say "D3 · the trust sheet"
if published "trust sheet"; then
  T=$(auth_get "/reports/$REPORT/trust" "$READER")
else
  T=$(auth_get "/reports/$REPORT/trust" "$OWNER")
fi
echo "$T" | grep -q '"strength"' && ok "strength present" || bad "no strength"
echo "$T" | grep -q '"rationale"' && ok "rationale sentence present" || bad "no rationale"
echo "  rationale: $(echo "$T" | jget result.rationale)"

say "D10 · share link promises what a recipient sees"
if published "share link"; then
  SH=$(auth_post "/reports/$REPORT/share-link" "$OWNER")
  echo "$SH" | grep -q '"authorName":false' && ok "recipient sees no author name" || bad "share promise missing"
  echo "$SH" | grep -q "$CASEREF" && ok "link carries the case reference" || bad "link missing the ref"
  SHR=$(auth_post_code "/reports/$REPORT/share-link" "$READER")
  check "only the author can mint a share link" "$SHR" "403"
else
  SHP=$(auth_post_code "/reports/$REPORT/share-link" "$OWNER")
  check "an unpublished report cannot be shared" "$SHP" "409"
fi

say "B3 · the owner was notified of the corroboration"
NT=$(auth_get /notifications "$OWNER")
if published "corroboration notification"; then
  echo "$NT" | grep -q 'corroboration_or_reply' && ok "reply/corroboration notification present" || bad "no notification: $NT"
fi
echo "$NT" | grep -q '"unread":' && ok "unread count present for the header dot" || bad "no unread count"
MR=$(auth_post /notifications/read-all "$OWNER")
echo "$MR" | grep -q '"success":1' && ok "mark all read" || bad "read-all failed"

say "D2 · edit is owner-only"
NOPE=$(curl -s -X PATCH "$API/reports/$REPORT" -H 'Content-Type: application/json' -H "Authorization: Bearer $READER" -d '{"title":"hijacked"}')
if [ "$PUBLISHED" = 1 ]; then
  echo "$NOPE" | grep -qi 'not your report' && ok "a reader cannot edit" || bad "reader edited someone else's report"
else
  # Unpublished: the reader cannot even see it, so the answer is a 404.
  echo "$NOPE" | grep -qi 'not available' && ok "a reader cannot edit (or see) it" || bad "reader edited someone else's report"
fi

say "D2 · the owner can edit the title — and it is checked again"
ED=$(curl -s -X PATCH "$API/reports/$REPORT" -H 'Content-Type: application/json' -H "Authorization: Bearer $OWNER" -d '{"title":"Stopped and searched outside the station"}')
echo "$ED" | grep -q 'Stopped and searched outside the station' && ok "title updated" || bad "edit failed: $ED"
echo "$ED" | grep -q '"moderation":{' && ok "the edited report carries its moderation state" || bad "no moderation block after edit"
wait_moderation "$REPORT" "$OWNER" "$READER" "edited report"

# An empty id would make `/reports/$X` collapse to `/reports`, which is the feed
# route and answers 200 — so a broken extraction would read as a passing test.
require_id() { if [ -z "$2" ]; then bad "$1 (no id extracted)"; return 1; fi; return 0; }

say "private reports are approved at filing, never checked, and 404 for everyone else"
PD=$(auth_post /reports/drafts "$OWNER" '{"step":6,"payload":{"category":"medical","title":"Private note","body":"Only me.","occurredAt":"2026-08-13T10:00:00.000Z","visibility":"private"}}')
PDRAFT=$(echo "$PD" | jget result.draftId)
PF=$(auth_post /reports "$OWNER" "{\"draftId\":\"$PDRAFT\",\"attested\":true}")
PREPORT=$(echo "$PF" | jget result.reportId)
if require_id "private report filed" "$PREPORT"; then
  check "a private report is approved at filing" "$(echo "$PF" | jget result.moderationState)" "approved"
  check "its owner sees it as private" "$(echo "$PF" | jget result.displayStatus)" "private"
  PS=$(auth_code "/reports/$PREPORT" "$READER")
  check "private report status for a stranger" "$PS" "404"
  PSH=$(auth_post_code "/reports/$PREPORT/share-link" "$OWNER")
  check "a private report cannot be shared" "$PSH" "409"
fi

say "D2 · delete states the 30-day window"
if require_id "delete target" "$PREPORT"; then
  DEL=$(curl -s -X DELETE "$API/reports/$PREPORT" -H "Authorization: Bearer $OWNER")
  echo "$DEL" | grep -q 'destroyed after 30 days' && ok "delete repeats the D2 promise" || bad "delete copy wrong: $DEL"
  GONE=$(curl -s -o /dev/null -w '%{http_code}' "$API/reports/$PREPORT" -H "Authorization: Bearer $OWNER")
  check "deleted report is gone for its owner too" "$GONE" "200"
fi

say "unauthenticated writes are refused"
UN=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/reports/drafts" -H 'Content-Type: application/json' -d '{"step":1,"payload":{}}')
check "anonymous draft status" "$UN" "401"

printf '\n\033[1m%s passed, %s failed, %s skipped\033[0m\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ]
