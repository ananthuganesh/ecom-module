"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/utils/productForm";

const TITLE_MAX = 70;
const TITLE_RECOMMENDED = "50–60";
const DESC_MAX = 160;
const DESC_RECOMMENDED = "150–160";

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storeOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://urbanaana.com";
}

function formatPreviewPrice(sellingPrice) {
  const n = Number(sellingPrice);
  if (!Number.isFinite(n) || n < 0) return "";
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} INR`;
}

function CharHint({ length, max, recommended }) {
  return (
    <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px] text-[#616161]">
      <span>Recommended: {recommended} characters</span>
      <span className="tabular-nums">
        {length}/{max}
      </span>
    </p>
  );
}

export default function ProductSeoCard({
  form,
  updateForm,
  storeName = "Urban Aana",
}) {
  const [editing, setEditing] = useState(false);
  const slug = String(form?.slug || "").trim();
  const productName = String(form?.productName || "").trim();
  const metaTitle = String(form?.metaTitle || "");
  const metaDescription = String(form?.metaDescription || "");

  const previewTitle = (
    metaTitle.trim() ||
    productName ||
    "Page title"
  ).slice(0, TITLE_MAX);

  const previewDescription = useMemo(() => {
    const custom = metaDescription.trim();
    if (custom) return custom.slice(0, DESC_MAX);
    const fromBody = stripHtml(form?.description);
    if (fromBody) return fromBody.slice(0, DESC_MAX);
    return formatPreviewPrice(form?.pricing?.sellingPrice);
  }, [metaDescription, form?.description, form?.pricing?.sellingPrice]);

  const origin = storeOrigin();
  const originHost = origin.replace(/^https?:\/\//, "");
  const handlePath = slug ? `product/${slug}` : "product/";
  const fullUrl = `${origin}/${handlePath}`;
  const breadcrumb = [originHost, "products", slug || undefined].filter(
    Boolean
  );

  const preview = (
    <div className="rounded-lg border border-[#ebebeb] bg-white px-3 py-2.5">
      <p className="truncate text-[12px] text-[#202124]">{storeName}</p>
      <p className="mt-0.5 truncate text-[12px] text-[#4d5156]">
        {breadcrumb.join(" › ")}
      </p>
      <p className="mt-1 truncate text-[18px] leading-6 font-normal text-[#1a0dab]">
        {previewTitle}
      </p>
      {previewDescription ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-[#4d5156]">
          {previewDescription}
        </p>
      ) : null}
    </div>
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Search engine listing</CardTitle>
        <CardAction>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#616161] hover:bg-[#f1f1f1]"
            aria-label={
              editing
                ? "Collapse search engine listing"
                : "Edit search engine listing"
            }
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editing ? (
          <>
            <div>
              <p className="mb-2 admin-card-label">Preview</p>
              {preview}
            </div>

            <div className="-mx-(--card-spacing) border-t border-[#ebebeb]" />

            <Field>
              <FieldLabel>Page title</FieldLabel>
              <Input
                value={metaTitle}
                maxLength={TITLE_MAX}
                placeholder={productName || "Page title"}
                onChange={(e) => updateForm({ metaTitle: e.target.value })}
                className="h-9 border-[#c9cccf] bg-white"
              />
              <CharHint
                length={metaTitle.length}
                max={TITLE_MAX}
                recommended={TITLE_RECOMMENDED}
              />
            </Field>

            <Field>
              <FieldLabel>Meta description</FieldLabel>
              <Textarea
                rows={3}
                value={metaDescription}
                maxLength={DESC_MAX}
                placeholder="Meta description"
                onChange={(e) =>
                  updateForm({ metaDescription: e.target.value })
                }
                className="min-h-[4.5rem] border-[#c9cccf] bg-white"
              />
              <CharHint
                length={metaDescription.length}
                max={DESC_MAX}
                recommended={DESC_RECOMMENDED}
              />
            </Field>

            <Field>
              <FieldLabel>URL handle</FieldLabel>
              <Input
                value={slug ? `product/${slug}` : "product/"}
                onChange={(e) => {
                  const raw = e.target.value.replace(/^products?\//i, "");
                  updateForm({
                    slug: slugify(raw),
                    slugManual: true,
                  });
                }}
                className="h-9 border-[#c9cccf] bg-white"
              />
              <p className="mt-1 truncate text-[12px] text-[#616161]">
                {fullUrl}
              </p>
            </Field>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full rounded-lg text-left hover:bg-[#fafafa]"
          >
            {preview}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
