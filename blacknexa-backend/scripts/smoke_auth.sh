#!/usr/bin/env bash
# End-to-end walkthrough of the auth module against a live server.
# Mirrors items 1-7 of the definition of done in docs/FEATURE_BUILD_PLAN.md §2.
API=http://localhost:4000/api/v1
# Overridable: reading a stale log from a previous run makes every code-based
# assertion fail in a way that looks like a regression in the code under test.
LOG=${LOG:-/tmp/bn-server.log}
EMAIL="renee.$(date +%s)@blacknexa.test"
PASS='Str0ng!Passw0rd'
PASS2='An0ther!Passw0rd'
COOLDOWN=31
pass=0; fail=0

say()  { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected $3, got $2)"; fi; }

# Pull the most recent code the mailer logged for an address.
code_for() {
  grep -o "Your BlackNexa[^\"]*code is [0-9]\{6\}" "$LOG" | tail -1 | grep -o '[0-9]\{6\}$'
}

post() { curl -s -X POST "$API$1" -H 'Content-Type: application/json' -d "$2"; }
post_auth() { curl -s -X POST "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "${3:-{\}}"; }
status() { curl -s -o /dev/null -w '%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' -d "$2"; }

say "A6 · register"
R=$(post /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"platform\":\"ios\",\"deviceLabel\":\"iPhone 15\"}")
echo "  $R"
echo "$R" | grep -q '"success":1' && ok "register accepted" || bad "register rejected"

say "A6 · weak password is rejected with the rule in words"
W=$(post /auth/register "{\"email\":\"weak@blacknexa.test\",\"password\":\"short\"}")
echo "  $W"
echo "$W" | grep -qi 'at least 10 characters' && ok "prints the A6 rule" || bad "did not print the rule"

say "A8 · verify email"
sleep 1
CODE=$(code_for)
echo "  code from mail log: $CODE"
V=$(post /auth/verify-email "{\"email\":\"$EMAIL\",\"code\":\"$CODE\",\"platform\":\"ios\",\"deviceLabel\":\"iPhone 15\"}")
ACCESS=$(echo "$V" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
REFRESH=$(echo "$V" | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)
[ -n "$ACCESS" ] && ok "session opened on verify" || bad "no access token returned"
echo "$V" | grep -q '"emailVerified":true' && ok "account marked verified" || bad "not marked verified"
echo "$V" | grep -q '"defaultVisibility":"trusted"' && ok "A9 default visibility is Trusted Circle" || bad "wrong default visibility"
echo "$V" | grep -q 'password_hash' && bad "password_hash leaked into the response" || ok "no password_hash in payload"
echo "$V" | grep -q '"user_id"' && bad "user_id leaked into the response" || ok "no user_id in payload"

say "A8 · a used code cannot be replayed"
RE=$(post /auth/verify-email "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}")
echo "  $RE"
echo "$RE" | grep -q '"success":false' && ok "replayed code refused" || bad "replayed code accepted"

say "auth/me with the access token"
ME=$(curl -s "$API/auth/me" -H "Authorization: Bearer $ACCESS")
echo "$ME" | grep -q "$EMAIL" && ok "me returns the profile" || bad "me failed: $ME"

say "A9 · update profile, and the defaults that C4/C6 read"
UP=$(curl -s -X PATCH "$API/users/me" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS" \
  -d '{"displayName":"Renee Whitfield","anonymousByDefault":true,"defaultVisibility":"public","defaultPrecision":"hidden"}')
echo "$UP" | grep -q '"displayName":"Renee Whitfield"' && ok "display name saved" || bad "display name not saved"
echo "$UP" | grep -q '"initials":"RW"' && ok "initials derived for the avatar tile" || bad "initials wrong"
echo "$UP" | grep -q '"anonymousByDefault":true' && ok "anonymity default saved" || bad "anonymity default not saved"
echo "$UP" | grep -q '"defaultPrecision":"hidden"' && ok "precision default saved" || bad "precision default not saved"

say "A7 · record consents"
C=$(post_auth /users/me/consents "$ACCESS" '{"documents":["tos","privacy"],"version":1}')
echo "$C" | grep -q '"success":1' && ok "consents recorded" || bad "consents failed: $C"

say "A10 · wrong password and unknown email are indistinguishable"
B1=$(post /auth/login "{\"email\":\"$EMAIL\",\"password\":\"WrongPassw0rd!\"}")
B2=$(post /auth/login "{\"email\":\"nobody-$(date +%s)@blacknexa.test\",\"password\":\"WrongPassw0rd!\"}")
E1=$(echo "$B1" | grep -o '"error":"[^"]*' | cut -d'"' -f4)
E2=$(echo "$B2" | grep -o '"error":"[^"]*' | cut -d'"' -f4)
echo "  wrong password : $E1"
echo "  unknown email  : $E2"
[ "$E1" = "$E2" ] && [ -n "$E1" ] && ok "identical message on both paths" || bad "messages differ"
[ "$E1" = "That email and password don't match." ] && ok "matches the A10 artboard copy" || bad "copy does not match A10"

say "A10 · correct login"
L=$(post /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"platform\":\"android\",\"deviceLabel\":\"Pixel 8\"}")
ACCESS2=$(echo "$L" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
REFRESH2=$(echo "$L" | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)
[ -n "$ACCESS2" ] && ok "second device signed in" || bad "login failed: $L"

say "two devices are two sessions"
S=$(curl -s "$API/users/me/sessions" -H "Authorization: Bearer $ACCESS2")
N=$(echo "$S" | grep -o '"deviceLabel"' | wc -l | tr -d ' ')
check "session count" "$N" "2"
echo "$S" | grep -q '"Pixel 8"' && ok "device label recorded" || bad "device label missing"

say "refresh rotates the token"
RF=$(post /auth/refresh "{\"refreshToken\":\"$REFRESH2\"}")
REFRESH3=$(echo "$RF" | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)
[ -n "$REFRESH3" ] && [ "$REFRESH3" != "$REFRESH2" ] && ok "refresh token rotated" || bad "token not rotated"

say "the old refresh token is rejected (replay)"
RP=$(post /auth/refresh "{\"refreshToken\":\"$REFRESH2\"}")
echo "  $RP"
echo "$RP" | grep -q '"success":false' && ok "replay refused" || bad "replay accepted"

say "A13 · forgot password says the same thing either way"
F1=$(status /auth/password/forgot "{\"email\":\"$EMAIL\"}")
F2=$(status /auth/password/forgot "{\"email\":\"definitely-not-registered@blacknexa.test\"}")
check "registered address status" "$F1" "202"
check "unknown address status" "$F2" "202"

say "A14 · reset with the emailed code"
sleep 1
RCODE=$(code_for)
echo "  code from mail log: $RCODE"
RS=$(post /auth/password/reset "{\"email\":\"$EMAIL\",\"code\":\"$RCODE\",\"password\":\"$PASS2\",\"platform\":\"ios\",\"deviceLabel\":\"iPhone 15\"}")
ACCESS4=$(echo "$RS" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
[ -n "$ACCESS4" ] && ok "reset signed the caller in" || bad "reset failed: $RS"

say "A15 · every other device is signed out, this one is not"
S2=$(curl -s "$API/users/me/sessions" -H "Authorization: Bearer $ACCESS4")
N2=$(echo "$S2" | grep -o '"deviceLabel"' | wc -l | tr -d ' ')
check "sessions remaining" "$N2" "1"
OLD=$(post /auth/refresh "{\"refreshToken\":\"$REFRESH3\"}")
echo "$OLD" | grep -q '"success":false' && ok "the other device's refresh now fails" || bad "other device still valid"

say "A14 · the old password no longer works"
OP=$(post /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$OP" | grep -q '"success":false' && ok "old password rejected" || bad "old password still works"

say "A14 · a password used before is refused"
# Wait out the resend cooldown, or forgot-password declines to send and the stale
# code fails validation before the reuse rule is reached.
echo "  waiting out the ${COOLDOWN}s resend cooldown..."
sleep "$COOLDOWN"
post /auth/password/forgot "{\"email\":\"$EMAIL\"}" > /dev/null
sleep 2
RCODE2=$(code_for)
RU=$(post /auth/password/reset "{\"email\":\"$EMAIL\",\"code\":\"$RCODE2\",\"password\":\"$PASS2\"}")
echo "  $RU"
echo "$RU" | grep -qi 'not used here before' && ok "password reuse refused" || bad "reuse allowed"

say "logout revokes only this device"
post_auth /auth/logout "$ACCESS4" > /dev/null
S3=$(curl -s "$API/users/me/sessions" -H "Authorization: Bearer $ACCESS4")
echo "$S3" | grep -q '"deviceLabel"' && bad "session survived logout" || ok "session revoked"

# A15 prints "every other device has been signed out". That is only true if the
# access token stops working now rather than when it happens to expire, so the
# guard checks the session row on every request — see auth.middleware.ts.
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/me" -H "Authorization: Bearer $ACCESS4")
check "the access token dies with the session" "$CODE" "401"

printf '\n\033[1m%s passed, %s failed\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
