"use client";

import { Calendar, FileText, Package, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function InventoryViewModal({ isOpen, onClose, entry }) {
  if (!entry) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="border-b border-border bg-muted/30 px-5 py-4">
          <DialogTitle>Inventory batch details</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 p-5">
          <section className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Product name</p>
            <h4 className="flex items-center gap-2 text-sm font-medium text-foreground"><Package className="size-4 text-primary" />{entry.productName}</h4>
          </section>
          <div className="grid grid-cols-2 gap-6">
            <Detail icon={User} label="Supplier" value={entry.supplier} />
            <Detail icon={Calendar} label="Date" value={new Date(entry.purchaseDate).toLocaleDateString(undefined, { dateStyle: "long" })} />
          </div>
          <div className="grid grid-cols-3 gap-4 border-y border-border py-4">
            <Metric label="Unit price" value={`₹${entry.purchasePrice.toLocaleString()}`} />
            <Metric label="Quantity" value={entry.quantity} />
            <Metric label="Total cost" value={`₹${entry.totalCost.toLocaleString()}`} />
          </div>
          {entry.notes && <section><p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><FileText className="size-3" />Batch notes</p><p className="rounded-md border border-border bg-muted/30 p-3 text-xs italic text-muted-foreground">&quot;{entry.notes}&quot;</p></section>}
        </div>
        <div className="flex justify-end border-t border-border bg-muted/30 px-5 py-3"><Button type="button" onClick={onClose}>Close details</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ icon: Icon, label, value }) {
  return <div><p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="size-3" />{label}</p><p className="text-xs font-medium text-foreground">{value}</p></div>;
}

function Metric({ label, value }) {
  return <div><p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p><p className="text-sm font-medium text-foreground">{value}</p></div>;
}
