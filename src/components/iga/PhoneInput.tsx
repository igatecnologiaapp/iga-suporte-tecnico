import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Input } from "../ui/input";
import {
  formatPhoneField,
  phoneCaret,
  phoneFieldError,
  phoneLimits,
  type PhoneKind,
} from "../../lib/phone-format";

type Props = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "onKeyDown" | "ref"
> & {
  defaultValue?: string | null;
  kind: PhoneKind;
};

export function PhoneInput({ defaultValue, kind, ...props }: Props) {
  const initial = formatPhoneField(defaultValue ?? "", kind);
  const last = useRef(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const [feedback, setFeedback] = useState(() => phoneFieldError(initial, kind));
  useEffect(() => {
    const input = inputRef.current;
    if (input) input.setCustomValidity(phoneFieldError(input.value, kind) ?? "");
  }, [initial, kind]);
  function applyFormat(input: HTMLInputElement, caret: number) {
    const raw = input.value;
    const count = raw.replace(/\D/g, "").length;
    const previous = last.current.replace(/\D/g, "").length;
    const error = phoneFieldError(raw, kind);
    if (error && (count >= previous || raw.trim().startsWith("+"))) {
      input.value = last.current;
      const before = raw.slice(0, caret).replace(/\D/g, "").length;
      const position = phoneCaret(
        last.current,
        Math.max(0, before - Math.max(0, count - previous)),
      );
      input.setSelectionRange(position, position);
      setFeedback(error);
      return;
    }
    const formatted = formatPhoneField(raw, kind);
    input.value = formatted;
    const position =
      formatted === raw
        ? caret
        : phoneCaret(formatted, raw.slice(0, caret).replace(/\D/g, "").length);
    input.setSelectionRange(position, position);
    last.current = formatted;
    input.setCustomValidity(phoneFieldError(formatted, kind) ?? "");
    setFeedback(phoneFieldError(formatted, kind));
  }
  return (
    <>
      <Input
        {...props}
        ref={inputRef}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={initial}
        placeholder={kind === "phone" ? "(11) 9999-9999" : "(11) 99999-9999"}
        title={`Máximo de ${phoneLimits[kind]} dígitos com DDD`}
        aria-invalid={Boolean(phoneFieldError(last.current, kind)) || undefined}
        aria-describedby={
          [props["aria-describedby"], feedback ? messageId : ""].filter(Boolean).join(" ") ||
          undefined
        }
        onChange={(event) =>
          applyFormat(
            event.currentTarget,
            event.currentTarget.selectionStart ?? event.currentTarget.value.length,
          )
        }
        onKeyDown={(event) => {
          if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            !["Backspace", "Delete"].includes(event.key)
          )
            return;
          const input = event.currentTarget;
          if (!/^\+?[\d\s().-]*$/.test(input.value.trim())) return;
          const start = input.selectionStart;
          if (start === null || start !== input.selectionEnd) return;
          const backward = event.key === "Backspace";
          let index = backward ? start - 1 : start;
          if (index < 0 || index >= input.value.length || /\d/.test(input.value[index]!)) return;
          while (index >= 0 && index < input.value.length && !/\d/.test(input.value[index]!))
            index += backward ? -1 : 1;
          if (index < 0 || index >= input.value.length) return;
          event.preventDefault();
          input.value = input.value.slice(0, index) + input.value.slice(index + 1);
          applyFormat(input, backward ? index : start);
        }}
      />
      {feedback && (
        <p id={messageId} role="alert" className="mt-1 text-xs text-destructive">
          {feedback}
        </p>
      )}
    </>
  );
}
