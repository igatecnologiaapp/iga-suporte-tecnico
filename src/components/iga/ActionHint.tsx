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
          <span
            className={`inline-flex rounded-md ${disabled ? "cursor-not-allowed" : ""}`}
            tabIndex={disabled ? 0 : undefined}
            role={disabled ? "group" : undefined}
            aria-label={disabled ? message : undefined}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-pretty leading-relaxed">{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
