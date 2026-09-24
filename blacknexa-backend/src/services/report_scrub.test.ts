/**
 * Unit tests for the deterministic report scrub — `npm test`.
 *
 * docs/INCIDENT_MODULE_PLAN.md D14: filing and edits redact contact and account
 * details with regular expressions only, and must leave the details a
 * civil-rights report exists to record — officers' names and badge numbers,
 * complaint and case numbers, dates, times, addresses of public places.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { passesLuhn, scrubReportText } from "./report_scrub";

test("emails are redacted", () => {
  const result = scrubReportText("Write to me at jane.doe+bnx@example.org if you saw it.");
  assert.equal(result.text, "Write to me at [EMAIL] if you saw it.");
  assert.deepEqual(result.redactedItems, ["EMAIL"]);
  assert.equal(result.redactedCount, 1);
});

test("phone numbers in common formats are redacted", () => {
  for (const phone of ["07911 123456", "+44 20 7946 0958", "+1 (212) 555-0123", "212.555.0123", "2125550123"]) {
    const result = scrubReportText(`Call me on ${phone} tonight.`);
    assert.equal(result.text, "Call me on [PHONE] tonight.", phone);
    assert.deepEqual(result.redactedItems, ["PHONE"], phone);
  }
});

test("reference numbers after case, complaint, badge, ref or # are kept", () => {
  const samples = [
    "My complaint number 2024123456 was ignored.",
    "Case #123456789 is still open.",
    "The officer's badge 12345678901 was visible.",
    "Ref: 987654321 from the housing office.",
    "Incident no. 5551234567 at the precinct.",
    "Report ID 123456789 was issued.",
    "See #1234567890 in the file.",
  ];
  for (const text of samples) {
    const result = scrubReportText(text);
    assert.equal(result.text, text, text);
    assert.equal(result.redactedCount, 0, text);
  }
});

test("dates, times, years and short numbers survive", () => {
  const text =
    "On 2026-08-13 at 19:22, near 145 Utica Ave, two officers (unit 73) stopped me; in 2019 and 2020 the same happened.";
  const result = scrubReportText(text);
  assert.equal(result.text, text);
  assert.equal(result.redactedCount, 0);
});

test("a US social-security number is redacted", () => {
  const result = scrubReportText("They read out my SSN 123-45-6789 in front of everyone.");
  assert.equal(result.text, "They read out my SSN [ID_NUMBER] in front of everyone.");
  assert.deepEqual(result.redactedItems, ["SSN"]);
});

test("a Luhn-valid card number is redacted, an arbitrary long number is not", () => {
  const card = scrubReportText("They charged 4111 1111 1111 1111 twice.");
  assert.equal(card.text, "They charged [CARD] twice.");
  assert.deepEqual(card.redactedItems, ["CARD"]);

  // 16 digits failing Luhn, and too long to be a phone number: left alone.
  const notCard = scrubReportText("Tracking 1234 5678 9012 3456 was on the parcel.");
  assert.equal(notCard.text, "Tracking 1234 5678 9012 3456 was on the parcel.");
  assert.equal(notCard.redactedCount, 0);
});

test("several details in one text are all counted, values never reported", () => {
  const result = scrubReportText("Email a@b.co or call 07911 123456.");
  assert.equal(result.text, "Email [EMAIL] or call [PHONE].");
  assert.deepEqual(result.redactedItems, ["EMAIL", "PHONE"]);
  assert.ok(!result.redactedItems.some((item) => item.includes("@") || /\d/.test(item)));
});

test("the Luhn check", () => {
  assert.equal(passesLuhn("4111111111111111"), true);
  assert.equal(passesLuhn("4111111111111112"), false);
  assert.equal(passesLuhn(""), false);
  assert.equal(passesLuhn("41a1"), false);
});

test("text with nothing to redact is returned unchanged", () => {
  const text = "Officer Daniels, badge 4471, told me to leave the station.";
  const result = scrubReportText(text);
  assert.equal(result.text, text);
  assert.deepEqual(result.redactedItems, []);
});
