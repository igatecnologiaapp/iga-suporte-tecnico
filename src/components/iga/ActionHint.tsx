import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

/** A disabled button cannot receive focus or pointer events; its wrapper can. */
export function ActionHint({
  message,
  disabled,
  children,
}: {
  message: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? (
            <span
              className="inline-flex cursor-not-allowed rounded-md"
              tabIndex={0}
              role="group"
              aria-label={message}
            >
              {children}
            </span>
          ) : (
            children
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-pretty leading-relaxed">{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
