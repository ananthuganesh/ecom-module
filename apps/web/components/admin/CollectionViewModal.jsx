"use client";

import { Package } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CollectionViewModal({ isOpen, onClose, collection }) {
  return (
    <Dialog open={!!isOpen && !!collection} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {collection ? (
          <>
            <div className="relative h-48 shrink-0 bg-muted sm:h-64">
              <SafeImage
                src={collection.image}
                alt={collection.title}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute right-0 bottom-6 left-0 px-6">
                <DialogHeader className="gap-1 space-y-0 p-0 text-left">
                  <DialogTitle className="text-2xl text-primary-foreground">
                    {collection.title}
                  </DialogTitle>
                  <DialogDescription className="max-w-lg line-clamp-2 text-primary-foreground/70">
                    {collection.summary}
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-6">
                <h3 className="mb-4 text-[13px] font-medium text-muted-foreground">
                  Products in this collection ({collection.products?.length || 0})
                </h3>

                {collection.products?.length ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {collection.products.map((p) => (
                      <Card key={p._id} className="gap-0 py-0 shadow-none">
                        <CardContent className="flex items-center gap-4 p-3">
                          <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded border border-border bg-background">
                            <SafeImage
                              src={
                                p.thumbnails?.[0] ||
                                p.variants?.[0]?.images?.[0]
                              }
                              fill
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-foreground">
                              {p.productName || p.name}
                            </p>
                            <p className="mb-1 text-sm text-muted-foreground">{p.productId}</p>
                            <div className="flex items-center gap-3">
                              <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                                <Package className="size-3" />
                                {p.totalStock ?? 0} In Stock
                              </span>
                              <span className="text-[13px] font-medium text-foreground">
                                ₹{p.pricing?.sellingPrice}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Empty className="border-0 py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Package />
                      </EmptyMedia>
                      <EmptyTitle>No products added yet</EmptyTitle>
                      <EmptyDescription>
                        Add products to this collection to preview them here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="border-t border-border bg-muted/40 p-4 sm:justify-end">
              <Button size="lg" className="h-8" onClick={onClose}>
                Close Preview
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
