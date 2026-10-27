/** Área: Rótulos de formulário e indicador visual compartilhado de obrigatoriedade. */
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

/** Mostra apenas o asterisco visual; a validação continua pertencendo ao campo. */
function RequiredMark() {
  return (
    <span aria-hidden="true" data-required-indicator className="ml-0.5 text-destructive">
      *
    </span>
  );
}

/** Associa o nome ao campo e acrescenta o marcador somente quando obrigatório. */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants> & { required?: boolean }
>(({ className, children, required = false, ...props }, ref) => (
  <>
    <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props}>
      {children}
    </LabelPrimitive.Root>
    {required && <RequiredMark />}
  </>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label, RequiredMark };
