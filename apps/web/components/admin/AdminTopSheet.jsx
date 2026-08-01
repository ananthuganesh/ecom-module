"use client";

import {
  Sheet,
  SheetContent,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Admin sheet that drops in from the top. Exit only via Cancel.
 */
export default function AdminTopSheet({
  open,
  onClose,
  children,
  footer,
  cancelLabel = "Cancel",
  className,
}) {
  return (
    <Sheet
      open={open}
      dismissible={false}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <SheetContent
        side="top"
        showCloseButton={false}
        className={cn(
          "max-h-[min(90vh,720px)] gap-0 overflow-hidden p-0",
          "data-[side=top]:inset-x-auto data-[side=top]:left-1/2 data-[side=top]:right-auto data-[side=top]:w-[min(100%,28rem)] data-[side=top]:max-w-md data-[side=top]:-translate-x-1/2 data-[side=top]:rounded-b-xl",
          className
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <SheetFooter className="mt-0 flex-row items-center justify-between gap-3 border-t bg-background px-5 py-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            className="h-8 rounded-md px-4 text-[13px] font-medium hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            {cancelLabel}
          </Button>
          {footer ? <div className="flex items-center gap-2">{footer}</div> : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
