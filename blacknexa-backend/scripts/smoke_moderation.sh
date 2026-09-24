#!/usr/bin/env bash
# The admin console's API against a live server — Content Moderation and
# Incident Management (docs/INCIDENT_MODULE_PLAN.md §8.1, §9.1; the contract is
# docs/ADMIN_MODERATION_API.md) — plus the nightly job and account deletion.
#
# Revision 2 rewrote this script together with the API it walks. The old queue
# (`/admin/moderation/reports*`, the HTML page, `/flags/:id/resolve`,
# `/comments/:id/hide`) is gone, and its 404s are checked. What it covers:
#
#   • RBAC — every role against both routers; a member token never gets in.
#   • The case queue — a member's flag opens a case; the User Flags and category
#     tabs list it; the summary counts it; the detail shows the full body, every
#     user report with who filed it (D15), the history and the runs.
#   • Decisions — Keep Published (flags dismissed), a double decision (409),
#     Reject (the author reads the reason label and the note), Remove Comment
#     (the commenter is told), Re-run AI on something held.
#   • D16 — an operator whose own member account wrote the content is refused,
#     the refusal is on the case history, and another operator can decide it.
#   • Keyword rules CRUD; ban / unban (sessions end, sign-in refused).
#   • Incidents — advocates see nothing until assigned (404), staff see metadata
#     only, assignment moves an approved submitted incident to under review,
#     internal notes, verify, dismiss → reopen, deactivate → gone for members →
#     reactivate, and a rejected report cannot be dismissed.
#   • Maintenance, and account deletion — both dispositions; erasure withdraws
#     the member's open moderation cases.
#
# Needs: a server whose log is at $LOG (member sign-up codes are read from it),
# the moderation worker running (it starts with the API), and the seeded
# operator accounts — `npm run db:seed:admin` (refused in production):
# superadmin@, moderator@, advocate@ and staff@blacknexa.com. Operator sign-in
# is two-step (password, then the emailed code); outside production the
# challenge carries `devCode`, which is what this script uses.
#
# Without an AI engine, public reports are held for a human (fail-closed). That
# is fine here: a held report is approved through the moderation API — itself a
# check — and the walk continues. Steps that need one particular pipeline
# outcome (Re-run AI needs something held) are reported as SKIP, not FAIL.
# MOD_WAIT (seconds, default 90) bounds each wait for the worker. The walk makes a
# few hundred requests from one IP; raise RATE_LIMIT_MAX locally (e.g. 2000) so
# the per-IP `apiLimiter` does not cut it short.
API=${API:-http://localhost:4000/api/v1}
ROOT=${ROOT:-http://localhost:4000}
LOG=${LOG:-/tmp/bn-server.log}
MOD_WAIT=${MOD_WAIT:-90}
SEED_PASSWORD=${ADMIN_SEED_PASSWORD:-BlackNexa2026!}
SUPER_EMAIL=${SUPER_EMAIL:-superadmin@blacknexa.com}
MOD_EMAIL=${MOD_EMAIL:-moderator@blacknexa.com}
ADV_EMAIL=${ADV_EMAIL:-advocate@blacknexa.com}
STAFF_EMAIL=${STAFF_EMAIL:-staff@blacknexa.com}
MEMBER_PASSWORD='Str0ng!Passw0rd'
ZERO=00000000-0000-4000-8000-000000000000
pass=0; fail=0; skip=0

say()     { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()      { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()     { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail+1)); }
skipped() { printf '  \033[33mSKIP\033[0m %s\n' "$1"; skip=$((skip+1)); }
check()   { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected $3, got $2)"; fi; }
present() { if [ -n "$2" ]; then ok "$1"; else bad "$1 (missing)"; fi; }

# A dot-separated path out of a JSON response, e.g. `jget result.id`. Python
# prints booleans as True/False.
jget() {
  python -c '
import json, sys
node = json.load(sys.stdin)
for key in sys.argv[1].split("."):
    if isinstance(node, dict):
        node = node.get(key)
    elif isinstance(node, list) and key.isdigit():
        node = node[int(key)] if int(key) < len(node) else None
    else:
        node = None
    if node is None:
        break
print("" if node is None else node)
' "$1" 2>/dev/null
}

# In the list at path $1, the first element whose field $2 equals $3; print its
# field $4 (empty when there is none). Exact matching, so a search for BNX-4471
# can never pick up BNX-44712.
jfind() {
  python -c '
import json, sys
def get(node, path):
    for key in path.split("."):
        if isinstance(node, dict):
            node = node.get(key)
        elif isinstance(node, list) and key.isdigit():
            node = node[int(key)] if int(key) < len(node) else None
        else:
            return None
        if node is None:
            return None
    return node
items = get(json.load(sys.stdin), sys.argv[1]) or []
for item in items:
    if str(get(item, sys.argv[2])) == sys.argv[3]:
        out = get(item, sys.argv[4])
        print("" if out is None else out)
        break
' "$1" "$2" "$3" "$4" 2>/dev/null
}

auth_get()       { curl -s "$API$1" -H "Authorization: Bearer $2"; }
auth_code()      { curl -s -o /dev/null -w '%{http_code}' "$API$1" -H "Authorization: Bearer $2"; }
auth_post()      { curl -s -X POST "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }
auth_post_code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }
auth_patch()     { curl -s -X PATCH "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }
auth_del()       { curl -s -X DELETE "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }
auth_del_code()  { curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }

# Operator sign-in: password → challenge (with devCode outside production) → session.
admin_login() {
  local email="$1" challenge cid code
  challenge=$(curl -s -X POST "$API/admin/auth/login" -H 'Content-Type: application/json' \
    -d "$(printf '{"email":"%s","password":"%s"}' "$email" "$SEED_PASSWORD")")
  cid=$(echo "$challenge" | jget result.challengeId)
  code=$(echo "$challenge" | jget result.devCode)
  if [ -z "$cid" ] || [ -z "$code" ]; then return 0; fi
  curl -s -X POST "$API/admin/auth/mfa/verify" -H 'Content-Type: application/json' \
    -d "$(printf '{"challengeId":"%s","code":"%s"}' "$cid" "$code")" | jget result.tokens.accessToken
}

# Register + verify a member, returning their access token.
make_member() {
  local email="$1" code
  curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "$(printf '{"email":"%s","password":"%s"}' "$email" "$MEMBER_PASSWORD")" > /dev/null
  sleep 1
  code=$(grep -o "code is [0-9]\{6\}" "$LOG" | tail -1 | grep -o '[0-9]\{6\}')
  curl -s -X POST "$API/auth/verify-email" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"code\":\"$code\"}" \
    | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4
}

member_id() { auth_get /auth/me "$1" | jget result.id; }
admin_id()  { auth_get /admin/auth/me "$1" | jget result.id; }

# File a report through the wizard and echo "<id> <caseRef>". Titles ≤ 70 chars (C2).
file_report() {
  local token="$1" title="$2" visibility="$3" draft filed
  draft=$(auth_post /reports/drafts "$token" '{"step":1,"payload":{"category":"policing"}}' | jget result.draftId)
  auth_post /reports/drafts "$token" "$(printf '{"step":7,"draftId":"%s","payload":{"category":"policing","title":"%s","body":"A full account of what happened, written out at enough length to be a real report body.","occurredAt":"2026-08-01T14:00:00.000Z","occurredPrecision":"exact","locationLabel":"Brownsville, Brooklyn","locationPrecision":"approximate","lat":40.6636,"lng":-73.9107,"visibility":"%s","anonymous":false}}' "$draft" "$title" "$visibility")" > /dev/null
  filed=$(auth_post /reports "$token" "{\"draftId\":\"$draft\",\"attested\":true}")
  printf '%s %s' "$(echo "$filed" | jget result.reportId)" "$(echo "$filed" | jget result.caseRef)"
}

# Wait until the owner's view of report $1 leaves `pending`; print the state.
wait_decided() {
  local report="$1" owner="$2" i state=""
  for i in $(seq 1 "$MOD_WAIT"); do
    state=$(auth_get "/reports/$report" "$owner" | jget result.moderation.state)
    if [ -n "$state" ] && [ "$state" != "pending" ]; then break; fi
    sleep 1
  done
  printf '%s' "$state"
}

# The open case of type $2 on report $1 (by its BNX ref), as operator $3 sees it.
open_case() {
  auth_get "/admin/moderation/cases?state=open&targetType=$2&search=$1&limit=100" "$3" | jfind result report.caseRef "$1" id
}

# Get report $1 ($2) published: wait for the pipeline, and approve its case as the
# moderator when it was held (fail-closed without an AI engine). 0 = it is live.
publish() {
  local report="$1" ref="$2" owner="$3" state cid
  state=$(wait_decided "$report" "$owner")
  if [ "$state" = "approved" ]; then return 0; fi
  if [ "$state" != "held" ]; then return 1; fi
  cid=$(open_case "$ref" report "$MOD")
  [ -n "$cid" ] || return 1
  auth_post "/admin/moderation/cases/$cid/approve" "$MOD" '{"internalNote":"smoke: published for the walkthrough"}' > /dev/null
  state=$(auth_get "/reports/$report" "$owner" | jget result.moderation.state)
  [ "$state" = "approved" ]
}

STAMP=$(date +%s)

# ── Sign-in ──────────────────────────────────────────────────────────────────

say "operators sign in (password, then the MFA code)"
SUPER=$(admin_login "$SUPER_EMAIL")
MOD=$(admin_login "$MOD_EMAIL")
ADV=$(admin_login "$ADV_EMAIL")
STAFF=$(admin_login "$STAFF_EMAIL")
present "superadmin signed in" "$SUPER"
present "moderator signed in" "$MOD"
present "advocate signed in" "$ADV"
present "support staff signed in" "$STAFF"
if [ -z "$SUPER" ] || [ -z "$MOD" ] || [ -z "$ADV" ] || [ -z "$STAFF" ]; then
  printf '\n  Seed the operator accounts first: npm run db:seed:admin (non-production only).\n'
  printf '\n\033[1m%d passed, %d failed, %d skipped\033[0m\n' "$pass" "$fail" "$skip"
  exit 1
fi
ADV_ID=$(admin_id "$ADV")
STAFF_ID=$(admin_id "$STAFF")

say "members sign up"
OWNER=$(make_member "adm.owner.$STAMP@blacknexa.test"); sleep 1
READER=$(make_member "adm.reader.$STAMP@blacknexa.test"); sleep 1
TARGET=$(make_member "adm.target.$STAMP@blacknexa.test"); sleep 1
# The moderator's own member account, in another spelling of the same inbox (D16).
SELF_EMAIL="${MOD_EMAIL%@*}+smoke$STAMP@${MOD_EMAIL#*@}"
SELF=$(make_member "$SELF_EMAIL")
[ -n "$OWNER" ] && [ -n "$READER" ] && [ -n "$TARGET" ] && [ -n "$SELF" ] \
  && ok "four members signed in" || bad "member setup failed — is LOG=$LOG the server's log?"

# ── RBAC and removed surfaces ────────────────────────────────────────────────

say "RBAC · members never get in; each role reaches only its own actions"
check "no token on the queue" "$(curl -s -o /dev/null -w '%{http_code}' "$API/admin/moderation/cases")" "401"
check "a member token on the queue" "$(auth_code /admin/moderation/cases "$OWNER")" "403"
check "a member token on incidents" "$(auth_code /admin/incidents "$OWNER")" "403"
check "advocate on the queue" "$(auth_code /admin/moderation/cases "$ADV")" "403"
check "staff on the queue" "$(auth_code /admin/moderation/cases "$STAFF")" "403"
check "moderator on the queue" "$(auth_code /admin/moderation/cases "$MOD")" "200"
check "staff on incidents" "$(auth_code /admin/incidents "$STAFF")" "200"
check "moderator on the assignee list (superadmin only)" "$(auth_code /admin/incidents/assignees "$MOD")" "403"
check "superadmin on the assignee list" "$(auth_code /admin/incidents/assignees "$SUPER")" "200"
check "moderator running maintenance (superadmin only)" "$(auth_post_code /admin/moderation/maintenance "$MOD")" "403"

say "revision 2 removed the old queue"
check "GET /admin/moderation (the HTML page)" "$(auth_code /admin/moderation "$MOD")" "404"
check "GET /admin/moderation/reports" "$(auth_code /admin/moderation/reports "$MOD")" "404"
check "POST /admin/moderation/flags/:id/resolve" "$(auth_post_code "/admin/moderation/flags/$ZERO/resolve" "$MOD")" "404"
check "POST /admin/moderation/comments/:id/hide" "$(auth_post_code "/admin/moderation/comments/$ZERO/hide" "$MOD")" "404"

# ── The case queue ───────────────────────────────────────────────────────────

say "a published report, flagged by a member, becomes a case"
read -r AID AREF <<<"$(file_report "$OWNER" "Stopped without cause on Rockaway Avenue" public)"
present "report filed ($AREF)" "$AID"
A_LIVE=0
if publish "$AID" "$AREF" "$OWNER"; then A_LIVE=1; ok "report published"; else bad "report $AREF never published"; fi

ACASE=""
if [ "$A_LIVE" = 1 ]; then
  FL=$(auth_post "/reports/$AID/flags" "$READER" '{"reason":"threat","note":"Smoke: urges people to confront him."}')
  echo "$FL" | grep -q '"flagRef":"FLG-' && ok "flag filed" || bad "flag failed: $FL"
  ACASE=$(open_case "$AREF" report "$MOD")
  present "the flag opened a case" "$ACASE"
fi

if [ -n "$ACASE" ]; then
  say "tabs, summary and the list's paging block"
  LU=$(auth_get "/admin/moderation/cases?tab=user&search=$AREF" "$MOD")
  check "listed under User Flags" "$(echo "$LU" | jfind result id "$ACASE" id)" "$ACASE"
  check "one 'User' badge" "$(echo "$LU" | jfind result id "$ACASE" sources.user)" "True"
  check "the flag's category is on the case" "$(echo "$LU" | jfind result id "$ACASE" categories.0)" "threat"
  echo "$LU" | grep -q '"pagination":{' && ok "the list carries a pagination block" || bad "no pagination block"
  check "listed under Direct Threat & Violence" \
    "$(auth_get "/admin/moderation/cases?tab=threat&search=$AREF" "$MOD" | jfind result id "$ACASE" id)" "$ACASE"
  check "not listed under Spam or Advertising" \
    "$(auth_get "/admin/moderation/cases?tab=spam&search=$AREF" "$MOD" | jfind result id "$ACASE" id)" ""
  SUM=$(auth_get /admin/moderation/cases/summary "$MOD")
  [ "$(echo "$SUM" | jget result.tabs.user)" -ge 1 ] 2>/dev/null && ok "the summary counts the User Flags tab" || bad "summary: $SUM"
  check "an unknown tab is refused" "$(auth_code "/admin/moderation/cases?tab=violence" "$MOD")" "400"

  say "the detail has what a moderator needs to decide once"
  D=$(auth_get "/admin/moderation/cases/$ACASE" "$MOD")
  check "the case" "$(echo "$D" | jget result.case.id)" "$ACASE"
  present "the full body" "$(echo "$D" | jget result.target.report.body)"
  present "the author's email (moderators see who filed it)" "$(echo "$D" | jget result.author.email)"
  present "who filed the user report (D15)" "$(echo "$D" | jget result.userFlags.0.reporter.id)"
  check "the user report's category" "$(echo "$D" | jget result.userFlags.0.category)" "threat"
  check "the user report's note" "$(echo "$D" | jget result.userFlags.0.note)" "Smoke: urges people to confront him."
  echo "$D" | grep -q '"history":\[' && ok "a history" || bad "no history"
  echo "$D" | grep -q '"runs":\[' && ok "the runs" || bad "no runs"
  check "a file that is not on the case" "$(auth_code "/admin/moderation/cases/$ACASE/evidence/$ZERO" "$MOD")" "404"

  say "Keep Published · flags dismissed, the case resolved, a second decision is 409"
  CV=$(echo "$D" | jget result.target.report.contentVersion); CV=${CV:-1}
  AP=$(auth_post "/admin/moderation/cases/$ACASE/approve" "$MOD" "{\"internalNote\":\"Smoke: quoted, not made.\",\"contentVersion\":$CV}")
  check "decided" "$(echo "$AP" | jget result.resolution)" "approved"
  check "not a first publish" "$(echo "$AP" | jget result.firstPublish)" "False"
  check "the flag dismissed" "$(echo "$AP" | jget result.flagsResolved)" "1"
  check "a second decision on the same case" "$(auth_post_code "/admin/moderation/cases/$ACASE/approve" "$MOD")" "409"
  check "still live for the owner" "$(auth_get "/reports/$AID" "$OWNER" | jget result.moderation.state)" "approved"
  check "on the Resolved view" \
    "$(auth_get "/admin/moderation/cases?state=resolved&sort=newest&search=$AREF" "$MOD" | jfind result id "$ACASE" resolution)" "approved"
fi

# ── Reject ───────────────────────────────────────────────────────────────────

say "Reject · the author reads the reason label and the note"
read -r BID BREF <<<"$(file_report "$OWNER" "Second report for the rejection path" public)"
present "report filed ($BREF)" "$BID"
BSTATE=$(wait_decided "$BID" "$OWNER")
if [ "$BSTATE" = "approved" ]; then auth_post "/reports/$BID/flags" "$READER" '{"reason":"spam"}' > /dev/null; fi
BCASE=$(open_case "$BREF" report "$MOD")
if [ -n "$BCASE" ]; then
  check "'other' without a note" "$(auth_post_code "/admin/moderation/cases/$BCASE/reject" "$MOD" '{"reasonCode":"other"}')" "400"
  check "a dismissal code is not a reject code" "$(auth_post_code "/admin/moderation/cases/$BCASE/reject" "$MOD" '{"reasonCode":"duplicate"}')" "400"
  RJ=$(auth_post "/admin/moderation/cases/$BCASE/reject" "$MOD" '{"reasonCode":"spam","publicNote":"This reads as an advert, not an incident.","internalNote":"Smoke."}')
  check "rejected" "$(echo "$RJ" | jget result.targetState)" "rejected"
  OV=$(auth_get "/reports/$BID" "$OWNER")
  check "the owner sees 'Not published'" "$(echo "$OV" | jget result.moderation.displayStatus)" "not_published"
  check "with the reason label" "$(echo "$OV" | jget result.moderation.reasonLabel)" "Spam or advertising"
  check "and the note" "$(echo "$OV" | jget result.moderation.note)" "This reads as an advert, not an incident."
  auth_get /notifications "$OWNER" | grep -q "Your report wasn't published" && ok "the owner was notified" || bad "no 'wasn't published' notification"
  check "a stranger cannot read it" "$(auth_code "/reports/$BID" "$READER")" "404"
  check "Incident Management: it cannot be dismissed until published" \
    "$(auth_post_code "/admin/incidents/$BID/dismiss" "$MOD" '{"reasonCode":"duplicate"}')" "409"
else
  bad "no case to reject for $BREF (state '$BSTATE')"
fi

# ── D16 ──────────────────────────────────────────────────────────────────────

say "D16 · an operator cannot decide on what their own member account wrote"
read -r CID CREF <<<"$(file_report "$SELF" "Filed by the moderator's member account" public)"
present "report filed by $SELF_EMAIL ($CREF)" "$CID"
CSTATE=$(wait_decided "$CID" "$SELF")
if [ "$CSTATE" = "approved" ]; then auth_post "/reports/$CID/flags" "$READER" '{"reason":"misleading"}' > /dev/null; fi
CCASE=$(open_case "$CREF" report "$SUPER")
if [ -n "$CCASE" ]; then
  SELFR=$(auth_post "/admin/moderation/cases/$CCASE/approve" "$MOD")
  echo "$SELFR" | grep -q "content you posted yourself" && ok "refused, and told why" || bad "not refused: $SELFR"
  check "reject refused too (403)" "$(auth_post_code "/admin/moderation/cases/$CCASE/reject" "$MOD" '{"reasonCode":"spam"}')" "403"
  auth_get "/admin/moderation/cases/$CCASE" "$SUPER" | grep -q '"self_action.refused"' \
    && ok "the refusal is on the case history" || bad "the refusal was not audited"
  check "another operator can decide it" "$(auth_post_code "/admin/moderation/cases/$CCASE/approve" "$SUPER")" "200"
else
  bad "no case for the self-dealing check ($CREF, state '$CSTATE')"
fi
check "nor verify it in Incident Management" "$(auth_post_code "/admin/incidents/$CID/verify" "$MOD")" "403"
SELF_ID=$(member_id "$SELF")
check "nor ban their own member account" \
  "$(auth_post_code "/admin/moderation/members/$SELF_ID/ban" "$MOD" '{"reasonCode":"repeat"}')" "403"

# ── Comments ─────────────────────────────────────────────────────────────────

say "Remove Comment · gone for others, and the commenter is told why"
if [ "$A_LIVE" = 1 ]; then
  CM=$(auth_post "/reports/$AID/comments" "$READER" '{"body":"Everyone should go down there and sort him out."}')
  CMID=$(echo "$CM" | jget result.id)
  present "comment posted" "$CMID"
  KCASE=""
  for i in $(seq 1 "$MOD_WAIT"); do
    if auth_get "/reports/$AID/comments?sort=new" "$OWNER" | grep -q "\"id\":\"$CMID\""; then
      auth_post "/comments/$CMID/flags" "$OWNER" '{"reason":"threat"}' > /dev/null
      KCASE=$(open_case "$AREF" comment "$MOD"); break
    fi
    KCASE=$(open_case "$AREF" comment "$MOD")
    [ -n "$KCASE" ] && break
    sleep 1
  done
  if [ -n "$KCASE" ]; then
    KR=$(auth_post "/admin/moderation/cases/$KCASE/reject" "$MOD" '{"reasonCode":"harassment","publicNote":"Please keep it about the incident."}')
    check "comment removed" "$(echo "$KR" | jget result.targetState)" "rejected"
    check "a comment case" "$(echo "$KR" | jget result.targetType)" "comment"
    auth_get "/reports/$AID/comments?sort=new" "$OWNER" | grep -q "\"id\":\"$CMID\"" \
      && bad "the removed comment is still shown to others" || ok "no longer shown to others"
    auth_get /notifications "$READER" | grep -q "Your comment was removed" \
      && ok "the commenter was told" || bad "no 'comment was removed' notice"
  else
    bad "the comment never reached a decision or a case"
  fi
else
  skipped "comment removal (the report was not published)"
fi

# ── Re-run, then the incident workflow's report ──────────────────────────────

say "Re-run AI · only something held, and it goes back to a check"
read -r DID DREF <<<"$(file_report "$OWNER" "Third report for the incident workflow" public)"
present "report filed ($DREF)" "$DID"
DSTATE=$(wait_decided "$DID" "$OWNER")
if [ "$DSTATE" = "held" ]; then
  DCASE=$(open_case "$DREF" report "$MOD")
  RR=$(auth_post "/admin/moderation/cases/$DCASE/rerun" "$MOD")
  present "re-run queued" "$(echo "$RR" | jget result.runId)"
  RS=$(auth_get "/reports/$DID" "$OWNER" | jget result.moderation.state)
  case "$RS" in
    pending|held) ok "back to a check ($RS)" ;;
    *) bad "unexpected state after a re-run: $RS" ;;
  esac
else
  skipped "Re-run AI needs a held report (it was '$DSTATE' — the AI engine decided it)"
fi
D_LIVE=0
if publish "$DID" "$DREF" "$OWNER"; then D_LIVE=1; ok "report $DREF published"; else bad "report $DREF never published"; fi

# ── Keyword rules ────────────────────────────────────────────────────────────

say "keyword rules · list, create, duplicate name, update, delete"
KL=$(auth_get "/admin/moderation/keyword-rules?limit=100" "$MOD")
echo "$KL" | grep -q '"Direct Threat & Violence"' && ok "the seeded rules are listed" || bad "no seeded rules: $KL"
echo "$KL" | grep -q '"pagination":{' && ok "paged" || bad "no pagination block"
check "staff cannot read the rules" "$(auth_code /admin/moderation/keyword-rules "$STAFF")" "403"
KC=$(auth_post /admin/moderation/keyword-rules "$MOD" "{\"name\":\"Smoke rule $STAMP\",\"category\":\"spam\",\"terms\":[\"smoke promo $STAMP\",\"flash sale*\"],\"action\":\"monitor\"}")
KID=$(echo "$KC" | jget result.id)
present "custom rule created" "$KID"
check "a custom rule" "$(echo "$KC" | jget result.kind)" "custom"
check "the same name in other case" \
  "$(auth_post_code /admin/moderation/keyword-rules "$MOD" "{\"name\":\"SMOKE RULE $STAMP\",\"category\":\"spam\",\"terms\":[\"another term\"]}")" "409"
check "a one-character term" \
  "$(auth_post_code /admin/moderation/keyword-rules "$MOD" "{\"name\":\"Smoke bad $STAMP\",\"category\":\"spam\",\"terms\":[\"x\"]}")" "400"
check "an empty update" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/admin/moderation/keyword-rules/$KID" -H 'Content-Type: application/json' -H "Authorization: Bearer $MOD" -d '{}')" "400"
check "disabled" "$(auth_patch "/admin/moderation/keyword-rules/$KID" "$MOD" '{"enabled":false}' | jget result.enabled)" "False"
check "deleted" "$(auth_del_code "/admin/moderation/keyword-rules/$KID" "$MOD")" "200"
check "gone once deleted" "$(auth_code "/admin/moderation/keyword-rules/$KID" "$MOD")" "404"

# ── Ban ──────────────────────────────────────────────────────────────────────

say "ban · every session ends and sign-in is refused; unban lets them back"
TARGET_ID=$(member_id "$TARGET")
present "the member's id" "$TARGET_ID"
check "a ban needs a reason" "$(auth_post_code "/admin/moderation/members/$TARGET_ID/ban" "$MOD" '{}')" "400"
check "'other' needs a note" "$(auth_post_code "/admin/moderation/members/$TARGET_ID/ban" "$MOD" '{"reasonCode":"other"}')" "400"
check "advocates cannot ban" "$(auth_post_code "/admin/moderation/members/$TARGET_ID/ban" "$ADV" '{"reasonCode":"repeat"}')" "403"
BN=$(auth_post "/admin/moderation/members/$TARGET_ID/ban" "$MOD" '{"reasonCode":"repeat","note":"Smoke."}')
check "banned" "$(echo "$BN" | jget result.status)" "banned"
[ "$(echo "$BN" | jget result.sessionsRevoked)" -ge 1 ] 2>/dev/null && ok "their sessions were revoked" || bad "no session revoked: $BN"
check "their token stops working" "$(auth_code /auth/me "$TARGET")" "401"
LG=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "$(printf '{"email":"%s","password":"%s"}' "adm.target.$STAMP@blacknexa.test" "$MEMBER_PASSWORD")")
echo "$LG" | grep -q '"accessToken"' && bad "a banned member signed in" || ok "sign-in refused while banned"
check "banning twice" "$(auth_post_code "/admin/moderation/members/$TARGET_ID/ban" "$MOD" '{"reasonCode":"repeat"}')" "409"
check "unbanned" "$(auth_post "/admin/moderation/members/$TARGET_ID/unban" "$MOD" '{"note":"Smoke."}' | jget result.status)" "active"
check "unbanning twice" "$(auth_post_code "/admin/moderation/members/$TARGET_ID/unban" "$MOD")" "409"
check "an unknown member" "$(auth_post_code "/admin/moderation/members/$ZERO/ban" "$MOD" '{"reasonCode":"repeat"}')" "404"

say "stats · the queue's health and the two mobile promises"
ST=$(auth_get /admin/moderation/stats "$MOD")
for key in openCases urgentUnassignedBreached safetyFlagBreached oldestOpenMinutes runsQueued autoApprovedLast24h heldLast24h slaMinutes; do
  [ -n "$(echo "$ST" | jget "result.$key")" ] && ok "stats.$key" || bad "stats.$key missing"
done
echo "$ST" | grep -q '"heldRateByLanguage":\[' && ok "stats.heldRateByLanguage" || bad "stats.heldRateByLanguage missing"

# ── Incidents ────────────────────────────────────────────────────────────────

if [ "$D_LIVE" = 1 ]; then
  say "incidents · the list and its counts"
  IL=$(auth_get "/admin/incidents?search=$DREF" "$SUPER")
  check "listed" "$(echo "$IL" | jfind result caseRef "$DREF" id)" "$DID"
  check "submitted" "$(echo "$IL" | jfind result caseRef "$DREF" status)" "submitted"
  echo "$IL" | grep -q '"pagination":{' && ok "paged" || bad "no pagination block"
  present "the summary counts" "$(auth_get /admin/incidents/summary "$SUPER" | jget result.all)"
  check "a bad date is refused" "$(auth_code "/admin/incidents?from=yesterday" "$SUPER")" "400"

  say "D17 · an advocate sees nothing until it is assigned to them"
  check "an unassigned incident" "$(auth_code "/admin/incidents/$DID" "$ADV")" "404"
  check "not in their list, whatever they ask for" \
    "$(auth_get "/admin/incidents?assignee=unassigned&search=$DREF" "$ADV" | jfind result caseRef "$DREF" id)" ""
  check "no note on it either" "$(auth_post_code "/admin/incidents/$DID/notes" "$ADV" '{"body":"x"}')" "404"

  say "assign · an approved submitted incident moves to under review"
  check "the advocate is offered" "$(auth_get /admin/incidents/assignees "$SUPER" | jfind result id "$ADV_ID" role)" "advocate"
  check "support staff cannot be assigned" \
    "$(auth_post_code "/admin/incidents/$DID/assign" "$SUPER" "{\"adminId\":\"$STAFF_ID\"}")" "400"
  AG=$(auth_post "/admin/incidents/$DID/assign" "$SUPER" "{\"adminId\":\"$ADV_ID\"}")
  check "assigned" "$(echo "$AG" | jget result.assignee.id)" "$ADV_ID"
  check "moved to under review" "$(echo "$AG" | jget result.status)" "under_review"
  check "the same person again changes nothing" \
    "$(auth_post "/admin/incidents/$DID/assign" "$SUPER" "{\"adminId\":\"$ADV_ID\"}" | jget result.changed)" "False"
  check "the advocate can open it now" "$(auth_code "/admin/incidents/$DID" "$ADV")" "200"
  check "it is in My Assigned Cases" "$(auth_get "/admin/incidents?assignee=me" "$ADV" | jfind result caseRef "$DREF" id)" "$DID"
  AN=$(auth_post "/admin/incidents/$DID/notes" "$ADV" '{"body":"Smoke: called the reporter back."}')
  check "the advocate adds an internal note" "$(echo "$AN" | jget result.body)" "Smoke: called the reporter back."
  check "but cannot verify" "$(auth_post_code "/admin/incidents/$DID/verify" "$ADV")" "403"

  say "staff · metadata only"
  SD=$(auth_get "/admin/incidents/$DID" "$STAFF")
  check "the tier" "$(echo "$SD" | jget result.access.tier)" "metadata"
  check "no body" "$(echo "$SD" | jget result.report.body)" ""
  check "marked redacted" "$(echo "$SD" | jget result.report.contentRedacted)" "True"
  check "no exact location" "$(echo "$SD" | jget result.report.location.exactLat)" ""
  check "no author email" "$(echo "$SD" | jget result.author.email)" ""
  check "no files" "$(auth_code "/admin/incidents/$DID/evidence/$ZERO" "$STAFF")" "403"
  present "a moderator sees the body" "$(auth_get "/admin/incidents/$DID" "$MOD" | jget result.report.body)"

  say "verify · the note stays internal, the author is told, publication unchanged"
  VF=$(auth_post "/admin/incidents/$DID/verify" "$MOD" '{"note":"Smoke: corroborated against the filed material."}')
  check "verified" "$(echo "$VF" | jget result.status)" "verified"
  check "still published" "$(echo "$VF" | jget result.moderationState)" "approved"
  VD=$(auth_get "/admin/incidents/$DID" "$MOD")
  echo "$VD" | grep -q "Smoke: corroborated against the filed material." && ok "the note is an internal admin note" || bad "note missing"
  present "verified by" "$(echo "$VD" | jget result.verifiedBy.name)"
  auth_get "/reports/$DID" "$OWNER" | grep -q "Smoke: corroborated" && bad "the internal note leaked to the owner" || ok "the owner never sees it"
  auth_get /notifications "$OWNER" | grep -q "Your report is verified" && ok "the owner was notified" || bad "no 'verified' notification"
  check "verifying twice" "$(auth_post_code "/admin/incidents/$DID/verify" "$MOD")" "409"

  say "deactivate → gone for members → reactivate"
  check "moderators cannot deactivate" "$(auth_post_code "/admin/incidents/$DID/deactivate" "$MOD" '{"reasonCode":"legal"}')" "403"
  check "'other' needs a note" "$(auth_post_code "/admin/incidents/$DID/deactivate" "$SUPER" '{"reasonCode":"other"}')" "400"
  DA=$(auth_post "/admin/incidents/$DID/deactivate" "$SUPER" '{"reasonCode":"legal","publicNote":"Court order."}')
  check "deactivated" "$(echo "$DA" | jget result.moderationState)" "deactivated"
  check "with the reason label" "$(echo "$DA" | jget result.moderationReasonLabel)" "Legal or safeguarding instruction"
  check "a member can no longer read it" "$(auth_code "/reports/$DID" "$READER")" "404"
  check "the owner sees 'Taken down'" "$(auth_get "/reports/$DID" "$OWNER" | jget result.moderation.displayStatus)" "taken_down"
  check "listed under Deactivated" "$(auth_get "/admin/incidents?status=deactivated&search=$DREF" "$SUPER" | jfind result caseRef "$DREF" id)" "$DID"
  check "not under All" "$(auth_get "/admin/incidents?status=all&search=$DREF" "$SUPER" | jfind result caseRef "$DREF" id)" ""
  check "deactivating twice" "$(auth_post_code "/admin/incidents/$DID/deactivate" "$SUPER" '{"reasonCode":"legal"}')" "409"
  check "no case verdict while deactivated" "$(auth_post_code "/admin/incidents/$DID/reopen" "$MOD" '{"note":"x"}')" "409"
  RA=$(auth_post "/admin/incidents/$DID/reactivate" "$SUPER" '{"note":"Order lifted."}')
  check "published again (it was live and is unchanged)" "$(echo "$RA" | jget result.moderationState)" "approved"
  check "readable again" "$(auth_code "/reports/$DID" "$READER")" "200"
  check "reactivating twice" "$(auth_post_code "/admin/incidents/$DID/reactivate" "$SUPER")" "409"
else
  skipped "the incident workflow (report $DREF was not published)"
fi

if [ "$A_LIVE" = 1 ]; then
  say "dismiss → reopen"
  check "'other' needs a note" "$(auth_post_code "/admin/incidents/$AID/dismiss" "$MOD" '{"reasonCode":"other"}')" "400"
  DS=$(auth_post "/admin/incidents/$AID/dismiss" "$MOD" '{"reasonCode":"duplicate","publicNote":"Same incident as an earlier report."}')
  check "dismissed" "$(echo "$DS" | jget result.status)" "dismissed"
  check "the owner sees it dismissed" "$(auth_get "/reports/$AID" "$OWNER" | jget result.moderation.displayStatus)" "dismissed"
  check "still readable (a verdict, not a take-down — D20)" "$(auth_code "/reports/$AID" "$READER")" "200"
  check "reopening needs a note" "$(auth_post_code "/admin/incidents/$AID/reopen" "$MOD" '{}')" "400"
  check "reopened" "$(auth_post "/admin/incidents/$AID/reopen" "$MOD" '{"note":"New footage arrived."}' | jget result.status)" "under_review"
  auth_get /notifications "$OWNER" | grep -q "being reviewed again" && ok "the owner was told" || bad "no 'reviewed again' notification"
fi

# ── Maintenance ──────────────────────────────────────────────────────────────

say "the nightly job runs on demand, and reports what it did"
M=$(auth_post /admin/moderation/maintenance "$SUPER")
echo "$M" | grep -q '"countsCorrected"' && ok "maintenance ran" || bad "maintenance failed: $M"
echo "$M" | grep -q '"filesPurged"' && ok "purge reported" || bad "purge not reported"

# ── Account deletion ─────────────────────────────────────────────────────────

say "deletion needs a disposition and the password again"
LEAVER=$(make_member "adm.leaver.$STAMP@blacknexa.test")
DEL=$(auth_del /users/me "$LEAVER" "{\"password\":\"$MEMBER_PASSWORD\"}")
echo "$DEL" | grep -qi "reports you filed" && ok "refuses without a disposition" || bad "accepted without a disposition: $DEL"
DEL=$(auth_del /users/me "$LEAVER" '{"disposition":"sever"}')
echo "$DEL" | grep -qi "confirm" && ok "refuses without re-authentication" || bad "accepted with no proof: $DEL"
DEL=$(auth_del /users/me "$LEAVER" '{"disposition":"sever","password":"WrongPassw0rd!"}')
echo "$DEL" | grep -qi "not right" && ok "refuses a wrong password" || bad "accepted a wrong password: $DEL"

say "sever · the account goes, the report stays as anonymous record"
read -r SID SREF <<<"$(file_report "$LEAVER" "Stopped again on the same corner in April" public)"
present "report filed ($SREF)" "$SID"
S_LIVE=0
if publish "$SID" "$SREF" "$LEAVER"; then S_LIVE=1; fi
DEL=$(auth_del /users/me "$LEAVER" "{\"disposition\":\"sever\",\"password\":\"$MEMBER_PASSWORD\"}")
check "the report severed" "$(echo "$DEL" | jget result.reportsSevered)" "1"
check "the token no longer works" "$(auth_code /auth/me "$LEAVER")" "401"
if [ "$S_LIVE" = 1 ]; then
  PAGE=$(curl -s "$ROOT/r/$SREF")
  echo "$PAGE" | grep -q "Stopped again on the same corner" && ok "the severed report survives" || bad "the severed report is gone"
  echo "$PAGE" | grep -qi "Filed anonymously" && ok "and reads as anonymous" || bad "the severed report still names someone"
else
  skipped "severed report page (it was not published)"
fi

say "erase · the report goes too, and its open moderation case is withdrawn"
ERASER=$(make_member "adm.eraser.$STAMP@blacknexa.test")
read -r EID EREF <<<"$(file_report "$ERASER" "An account that will be erased with its report" public)"
present "report filed ($EREF)" "$EID"
ESTATE=$(wait_decided "$EID" "$ERASER")
if [ "$ESTATE" = "approved" ]; then auth_post "/reports/$EID/flags" "$READER" '{"reason":"spam"}' > /dev/null; fi
ECASE=$(open_case "$EREF" report "$MOD")
DEL=$(auth_del /users/me "$ERASER" "{\"disposition\":\"erase\",\"password\":\"$MEMBER_PASSWORD\"}")
check "the report erased" "$(echo "$DEL" | jget result.reportsErased)" "1"
present "a purge date" "$(echo "$DEL" | jget result.filesPurgedAfter)"
check "gone from the public page" "$(curl -s -o /dev/null -w '%{http_code}' "$ROOT/r/$EREF")" "404"
if [ -n "$ECASE" ]; then
  check "its open case withdrawn" \
    "$(auth_get "/admin/moderation/cases?state=resolved&search=$EREF" "$MOD" | jfind result id "$ECASE" resolution)" "withdrawn"
  check "and it cannot be decided any more" "$(auth_post_code "/admin/moderation/cases/$ECASE/approve" "$MOD")" "409"
else
  bad "no open case on $EREF before the erasure (state '$ESTATE')"
fi

say "the deletions were logged, with no address in the log line"
grep -q '\[account\] deleted' "$LOG" && ok "deletion logged" || bad "deletion not logged"
grep '\[account\] deleted' "$LOG" | grep -q "adm.leaver.$STAMP@blacknexa.test" \
  && bad "the email address was written to the log" || ok "no address in the log line"

printf '\n\033[1m%d passed, %d failed, %d skipped\033[0m\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ] || exit 1
