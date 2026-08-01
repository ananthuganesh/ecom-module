"use client";

import {
  Sheet,
  SheetContent,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Admin side sheet. Exit only via the bottom Cancel button.
 */
export default function AdminSideSheet({
  open,
  onClose,
  children,
  footer,
  cancelLabel = "Cancel",
  widthClassName = "sm:max-w-[560px]",
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
        side="right"
        showCloseButton={false}
        className={`w-full gap-0 p-0 ${widthClassName}`}
      >
        <ScrollArea className="h-[calc(100%-57px)]">
          <div className="flex min-h-full flex-col">{children}</div>
        </ScrollArea>
        <SheetFooter className="flex-row items-center justify-between gap-3 border-t bg-background px-5 py-3 sm:flex-row">
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
