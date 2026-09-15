/**
 * The six-box one-time code input.
 *
 * A split input looks right and is genuinely awkward to use unless it handles
 * the cases people actually hit, so all of them are covered here:
 *
 *   • typing advances, Backspace on an empty box steps back
 *   • pasting a whole code fills every box, wherever it was pasted
 *   • arrows move, and clicking a box selects its digit so typing replaces it
 *   • the browser's SMS/email autofill lands correctly, because the first box
 *     carries `autocomplete="one-time-code"`
 *
 * For assistive technology the group is one labelled field rather than six
 * unlabelled ones — "digit 3 of 6" is navigation noise, not information.
 */

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

export interface MfaCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when the last box is filled, so the form can submit itself. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  /** Ties the group to an error message. */
  describedBy?: string;
  invalid?: boolean;
}

export function MfaCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  describedBy,
  invalid = false,
}: MfaCodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  /** Guards against firing onComplete twice for the same code. */
  const completedFor = useRef<string | null>(null);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (value.length === length && completedFor.current !== value) {
      completedFor.current = value;
      onComplete?.(value);
    }
    if (value.length < length) completedFor.current = null;
  }, [value, length, onComplete]);

  const focusBox = (index: number) => {
    const target = refs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    target?.select();
  };

  /** Replace one position and hand the whole code back. */
  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    // Trailing blanks are dropped so `value.length` means "digits entered".
    onChange(next.join("").replace(/\s/g, "").slice(0, length));
  };

  const onInput = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      setDigit(index, "");
      return;
    }

    // More than one digit means a paste or an autofill landed in this box:
    // spread it across the remaining boxes instead of taking only the first.
    if (cleaned.length > 1) {
      const merged = (value.slice(0, index) + cleaned).slice(0, length);
      onChange(merged);
      focusBox(merged.length);
      return;
    }

    setDigit(index, cleaned);
    if (index < length - 1) focusBox(index + 1);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "");
        return;
      }
      // Empty box: clear the one before and move there, which is what people
      // expect from holding Backspace to wipe a mistyped code.
      event.preventDefault();
      if (index > 0) {
        setDigit(index - 1, "");
        focusBox(index - 1);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focusBox(pasted.length);
  };

  return (
    <div
      className="mfa-code-grid"
      role="group"
      aria-label={`Security code, ${length} digits`}
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          className={`mfa-digit-input${disabled ? " locked" : ""}`}
          type="text"
          inputMode="numeric"
          // Only the first box claims the autofill: naming all six makes some
          // browsers drop the same digit into every one.
          {...(index === 0 ? { autoComplete: "one-time-code" } : { autoComplete: "off" })}
          maxLength={1}
          value={digit}
          disabled={disabled}
          {...(invalid ? { "aria-invalid": true } : {})}
          aria-label={`Digit ${index + 1}`}
          onChange={(e) => onInput(index, e.target.value)}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export default MfaCodeInput;
