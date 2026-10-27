import type { ComponentProps } from "react";
import { Input } from "../ui/input";
import { formatPhone, phoneCaret } from "../../lib/phone-format";

type Props = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "onKeyDown"
> & {
  defaultValue?: string | null;
};
function applyFormat(input: HTMLInputElement, caret: number) {
  const formatted = formatPhone(input.value, true);
  if (formatted === input.value) {
    input.setSelectionRange(caret, caret);
    return;
  }
  const count = input.value.slice(0, caret).replace(/\D/g, "").length;
  input.value = formatted;
  const position = phoneCaret(input.value, count);
  input.setSelectionRange(position, position);
}

export function PhoneInput({ defaultValue, ...props }: Props) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      defaultValue={formatPhone(defaultValue)}
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
  );
}
