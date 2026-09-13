"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { cn } from "@/lib/utils";

function productImage(product) {
  const thumb = (product?.thumbnails || []).find(Boolean);
  if (thumb) return thumb;
  return (product?.images || []).find(Boolean) || null;
}

function Row({ product, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product._id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-3 py-2",
        isDragging && "relative z-10 shadow-md"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${product.productName || "product"}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>

      <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
        <SafeImage
          src={productImage(product)}
          alt={product.productName || "Product"}
          fill
          className="object-cover"
        />
      </div>

      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {product.productName || product.name || "Untitled product"}
      </span>
    </li>
  );
}

/**
 * Drag products into the order shoppers see them in.
 *
 * Works on the full list rather than a page of it: positions are saved from
 * the whole arrangement, so a partial list would renumber products that are
 * not on screen.
 */
export default function ProductReorderList({ products = [], onChange }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    // A small distance so a click on a row is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = products.findIndex((p) => p._id === active.id);
    const newIndex = products.findIndex((p) => p._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange?.(arrayMove(products, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={(e) => setActiveId(e.active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext
        items={products.map((p) => p._id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-1.5">
          {products.map((product, index) => (
            <Row
              key={product._id}
              product={product}
              index={index}
              dragging={activeId === product._id}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
