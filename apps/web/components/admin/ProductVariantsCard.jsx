"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Database,
  GripVertical,
  ImagePlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { emptyVariant, generateSku } from "@/utils/productForm";
import { cn } from "@/lib/utils";

function trim(value) {
  return String(value || "").trim();
}

function isPlaceholderSize(value) {
  const s = trim(value).toLowerCase();
  return !s || s === "default";
}

function variantsConfigured(variants) {
  return (variants || []).some(
    (v) =>
      (!isPlaceholderSize(v.size) && trim(v.size)) ||
      trim(v.customValue) ||
      trim(v.customName)
  );
}

function uniqueSizes(variants) {
  const out = [];
  for (const v of variants || []) {
    const s = trim(v.size);
    if (s && !isPlaceholderSize(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function uniqueCustomValues(variants) {
  const out = [];
  for (const v of variants || []) {
    const s = trim(v.customValue);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function rebuildVariants({
  sizes,
  customName,
  customValues,
  prev,
  productId,
}) {
  const previous = Array.isArray(prev) ? prev : [];
  const sizeList = sizes.length ? sizes : [""];
  const customList = customValues.length ? customValues : [""];
  const next = [];

  sizeList.forEach((size) => {
    customList.forEach((customValue) => {
      const idx = next.length;
      const match =
        previous.find(
          (v) =>
            trim(v.size) === trim(size) &&
            trim(v.customValue) === trim(customValue)
        ) || previous[idx];
      next.push({
        ...emptyVariant(),
        ...(match || {}),
        size: size || "",
        customName: customValues.length ? customName || "Option" : "",
        customValue: customValues.length ? customValue || "" : "",
        quantity: Number(match?.quantity) || 0,
        images: Array.isArray(match?.images) ? [...match.images] : [],
        sku:
          trim(match?.sku) ||
          generateSku(
            productId,
            [size, customValue].filter(Boolean).join("-"),
            idx
          ),
        barcode: match?.barcode || "",
      });
    });
  });

  return next.length ? next : [emptyVariant()];
}

function variantLabel(v) {
  const size = trim(v.size);
  const custom = trim(v.customValue);
  if (size && custom) return `${size} / ${custom}`;
  return size || custom || "—";
}

function OptionEditorPanel({
  optionName,
  onOptionNameChange,
  optionNameError,
  values,
  onChangeValue,
  onCommitValue,
  onDelete,
  onDone,
}) {
  return (
    <div className="rounded-[0.75rem] border border-[#e3e3e3] bg-white p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-[1.85rem] inline-flex shrink-0 cursor-grab text-[#8a8a8a]"
          aria-label="Drag to reorder option"
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-[13px] font-medium text-[#303030]">
                Option name
              </label>
              <span
                className="inline-flex text-[#8a8a8a]"
                title="Option metafield"
                aria-hidden
              >
                <Database className="h-3.5 w-3.5" />
              </span>
            </div>
            <Input
              value={optionName}
              onChange={(e) => onOptionNameChange(e.target.value)}
              placeholder="Size"
              aria-invalid={optionNameError ? "true" : undefined}
              className={cn(
                "h-9 border-[#c9cccf] bg-white text-[13px] shadow-none",
                optionNameError &&
                  "border-[#e22c38] bg-[#fff4f4] text-[#303030] focus-visible:border-[#e22c38] focus-visible:ring-[#e22c38]/30"
              )}
            />
            {optionNameError ? (
              <p className="mt-1.5 flex items-start gap-1 text-[13px] text-[#c70a24]">
                <span aria-hidden>⚠</span>
                <span>Option name is required.</span>
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#303030]">
              Option values
            </label>
            <div className="space-y-2">
              {values.map((value, index) => {
                const isLast = index === values.length - 1;
                const showAddPlaceholder = isLast;

                return (
                  <Input
                    key={`opt-val-${index}`}
                    value={value}
                    onChange={(e) => onChangeValue(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onCommitValue(index);
                      }
                    }}
                    onBlur={() => onCommitValue(index)}
                    placeholder={
                      showAddPlaceholder ? "Add another value" : undefined
                    }
                    className="h-9 w-full border-[#c9cccf] bg-white text-[13px] shadow-none"
                  />
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#e3e3e3] bg-white px-3 text-[13px] font-medium text-[#c70a24] hover:bg-[#fff4f4] hover:text-[#8e0b21]"
              onClick={onDelete}
            >
              Delete
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#1a1a1a] px-3 text-[13px] font-medium text-white hover:bg-[#000]"
              onClick={onDone}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductVariantsCard({
  form,
  setForm,
  updatePricing,
  focusPricing,
  blurPricing,
  onUploadImage,
}) {
  const variants = form?.variants || [];
  const sizes = useMemo(() => uniqueSizes(variants), [variants]);
  const customValues = useMemo(() => uniqueCustomValues(variants), [variants]);
  const customName =
    trim(variants.find((v) => trim(v.customName))?.customName) || "Material";

  const configured = variantsConfigured(variants);
  const [started, setStarted] = useState(() => configured);
  const [editorOpen, setEditorOpen] = useState(() => !configured);
  const [editingSecond, setEditingSecond] = useState(false);

  const [optionName, setOptionName] = useState("Size");
  const [optionNameError, setOptionNameError] = useState(false);
  const [sizeInputs, setSizeInputs] = useState(() =>
    sizes.length ? [...sizes, ""] : [""]
  );

  const [secondOptionName, setSecondOptionName] = useState(customName);
  const [secondOptionNameError, setSecondOptionNameError] = useState(false);
  const [secondInputs, setSecondInputs] = useState(() =>
    customValues.length ? [...customValues, ""] : [""]
  );

  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!configured) return;
    setStarted(true);
    if (!editorOpen) {
      setSizeInputs(sizes.length ? [...sizes, ""] : [""]);
      setSecondInputs(customValues.length ? [...customValues, ""] : [""]);
      if (customName) setSecondOptionName(customName);
    }
  }, [configured, sizes, customValues, customName, editorOpen]);

  const totalAvailable = variants.reduce(
    (sum, v) => sum + (Number(v.quantity) || 0),
    0
  );
  const price = form?.pricing?.sellingPrice ?? "";

  const applyOptions = (nextSizes, nextCustomName, nextCustomValues) => {
    setForm((prev) => ({
      ...prev,
      variants: rebuildVariants({
        sizes: nextSizes,
        customName: nextCustomName,
        customValues: nextCustomValues,
        prev: prev.variants,
        productId: prev.productId,
      }),
    }));
  };

  const committedSizes = () =>
    sizeInputs.map(trim).filter((v, i, arr) => v && arr.indexOf(v) === i);

  const committedSecond = () =>
    secondInputs.map(trim).filter((v, i, arr) => v && arr.indexOf(v) === i);

  const startOptions = () => {
    setStarted(true);
    setEditorOpen(true);
    setOptionName("Size");
    setOptionNameError(false);
    setSizeInputs([""]);
    setEditingSecond(false);
  };

  const handleDoneFirst = () => {
    const name = trim(optionName);
    const values = committedSizes();
    if (!name) {
      setOptionNameError(true);
      return;
    }
    setOptionNameError(false);
    if (!values.length) return;
    applyOptions(
      values,
      customValues.length || editingSecond
        ? trim(secondOptionName) || customName
        : "",
      customValues.length || editingSecond ? committedSecond() : []
    );
    setSizeInputs([...values, ""]);
    setEditorOpen(false);
  };

  const handleDeleteFirst = () => {
    setStarted(false);
    setEditorOpen(false);
    setEditingSecond(false);
    setOptionName("Size");
    setOptionNameError(false);
    setSizeInputs([""]);
    setSecondInputs([""]);
    setForm((prev) => ({ ...prev, variants: [emptyVariant()] }));
  };

  const handleDoneSecond = () => {
    const name = trim(secondOptionName);
    const values = committedSecond();
    if (!name) {
      setSecondOptionNameError(true);
      return;
    }
    setSecondOptionNameError(false);
    if (!values.length) return;
    const sizeList = committedSizes().length ? committedSizes() : sizes;
    applyOptions(sizeList.length ? sizeList : sizes, name, values);
    setSecondInputs([...values, ""]);
    setEditingSecond(false);
  };

  const handleDeleteSecond = () => {
    setEditingSecond(false);
    setSecondOptionNameError(false);
    setSecondInputs([""]);
    applyOptions(committedSizes().length ? committedSizes() : sizes, "", []);
  };

  const updateSizeInput = (index, value) => {
    setSizeInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      if (next.some((v) => trim(v)) && trim(next[next.length - 1])) {
        next.push("");
      }
      return next;
    });
  };

  const commitSizeInput = (index) => {
    setSizeInputs((prev) => {
      const next = [...prev];
      const value = trim(next[index]);
      if (!value) {
        if (index < next.length - 1) next.splice(index, 1);
      } else {
        const earlier = next.findIndex(
          (v, i) => i !== index && trim(v).toLowerCase() === value.toLowerCase()
        );
        if (earlier >= 0) next.splice(index, 1);
      }
      const cleaned = next.filter((v, i, arr) => {
        if (trim(v)) return true;
        return i === arr.length - 1;
      });
      if (!cleaned.length) return [""];
      if (trim(cleaned[cleaned.length - 1])) cleaned.push("");
      return cleaned;
    });
  };

  const updateSecondInput = (index, value) => {
    setSecondInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      if (next.some((v) => trim(v)) && trim(next[next.length - 1])) {
        next.push("");
      }
      return next;
    });
  };

  const commitSecondInput = (index) => {
    setSecondInputs((prev) => {
      const next = [...prev];
      const value = trim(next[index]);
      if (!value) {
        if (index < next.length - 1) next.splice(index, 1);
      }
      const cleaned = next.filter((v, i, arr) => {
        if (trim(v)) return true;
        return i === arr.length - 1;
      });
      if (!cleaned.length) return [""];
      if (trim(cleaned[cleaned.length - 1])) cleaned.push("");
      return cleaned;
    });
  };

  const removeVariantAt = (index) => {
    setForm((prev) => {
      const next = (prev.variants || []).filter((_, i) => i !== index);
      return { ...prev, variants: next.length ? next : [emptyVariant()] };
    });
  };

  const toggleAll = (checked) => {
    const next = {};
    variants.forEach((_, i) => {
      next[i] = checked;
    });
    setSelected(next);
  };

  const showTable = started && sizes.length > 0;

  return (
    <Card className="admin-surface gap-0 rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <CardTitle className="admin-card-heading m-0">Variants</CardTitle>

        {!started ? (
          <button
            type="button"
            onClick={startOptions}
            className="flex w-full items-center gap-2 rounded-lg border border-transparent px-1 py-2 text-left text-[13px] font-medium text-[#616161] hover:bg-[#f7f7f7]"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#8a8a8a] text-[#303030]">
              <Plus className="h-3 w-3" />
            </span>
            Add options like size or colour
          </button>
        ) : (
          <>
            {editorOpen || editingSecond ? (
              <div className="space-y-3">
                {editorOpen ? (
                  <OptionEditorPanel
                    optionName={optionName}
                    onOptionNameChange={(v) => {
                      setOptionName(v);
                      if (trim(v)) setOptionNameError(false);
                    }}
                    optionNameError={optionNameError}
                    values={sizeInputs}
                    onChangeValue={updateSizeInput}
                    onCommitValue={commitSizeInput}
                    onDelete={handleDeleteFirst}
                    onDone={handleDoneFirst}
                  />
                ) : null}

                {editingSecond ? (
                  <OptionEditorPanel
                    optionName={secondOptionName}
                    onOptionNameChange={(v) => {
                      setSecondOptionName(v);
                      if (trim(v)) setSecondOptionNameError(false);
                    }}
                    optionNameError={secondOptionNameError}
                    values={secondInputs}
                    onChangeValue={updateSecondInput}
                    onCommitValue={commitSecondInput}
                    onDelete={handleDeleteSecond}
                    onDone={handleDoneSecond}
                  />
                ) : null}

                {!editingSecond && customValues.length === 0 ? (
                  <div className="border-t border-[#ebebeb] pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (editorOpen) {
                          const values = committedSizes();
                          const name = trim(optionName);
                          if (!name) {
                            setOptionNameError(true);
                            return;
                          }
                          if (values.length) {
                            applyOptions(values, "", []);
                            setSizeInputs([...values, ""]);
                            setEditorOpen(false);
                          }
                        }
                        setEditingSecond(true);
                        setSecondOptionNameError(false);
                        setSecondOptionName("Material");
                        setSecondInputs([""]);
                      }}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#005bd3] hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add another option
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditorOpen(true);
                    setOptionNameError(false);
                    setSizeInputs(sizes.length ? [...sizes, ""] : [""]);
                    setOptionName(trim(optionName) || "Size");
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border border-[#e3e3e3] bg-[#fafafa] px-3 py-2.5 text-left hover:bg-[#f3f3f3]"
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-[#8a8a8a]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-[550] text-[#303030]">
                      {trim(optionName) || "Size"}
                    </p>
                    <p className="truncate text-[12px] text-[#616161]">
                      {sizes.join(", ") || "No values"}
                    </p>
                  </div>
                </button>

                {customValues.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSecond(true);
                      setSecondOptionNameError(false);
                      setSecondInputs(
                        customValues.length ? [...customValues, ""] : [""]
                      );
                      setSecondOptionName(customName);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl border border-[#e3e3e3] bg-[#fafafa] px-3 py-2.5 text-left hover:bg-[#f3f3f3]"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-[#8a8a8a]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-[550] text-[#303030]">
                        {customName}
                      </p>
                      <p className="truncate text-[12px] text-[#616161]">
                        {customValues.join(", ")}
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="border-t border-[#ebebeb] pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSecond(true);
                        setSecondOptionNameError(false);
                        setSecondOptionName("Material");
                        setSecondInputs([""]);
                      }}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#005bd3] hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add another option
                    </button>
                  </div>
                )}
              </div>
            )}

            {showTable ? (
              <>
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#616161] hover:bg-[#f1f1f1]"
                    aria-label="Search variants"
                    title="Search"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-[#e3e3e3]">
                  <table className="w-full min-w-[36rem] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#ebebeb] bg-[#fafafa] text-[12px] font-medium text-[#616161]">
                        <th className="w-10 px-3 py-2">
                          <Checkbox
                            checked={
                              variants.length > 0 &&
                              variants.every((_, i) => selected[i])
                            }
                            onCheckedChange={(v) => toggleAll(!!v)}
                          />
                        </th>
                        <th className="px-2 py-2 font-medium">Variant</th>
                        <th className="w-32 px-2 py-2 font-medium">Price</th>
                        <th className="w-28 px-2 py-2 font-medium">Available</th>
                        <th className="w-10 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v, i) => {
                        const thumb = v.images?.[0];
                        return (
                          <tr
                            key={`${variantLabel(v)}-${i}`}
                            className="border-b border-[#ebebeb] last:border-0"
                          >
                            <td className="px-3 py-2 align-middle">
                              <Checkbox
                                checked={!!selected[i]}
                                onCheckedChange={(checked) =>
                                  setSelected((prev) => ({
                                    ...prev,
                                    [i]: !!checked,
                                  }))
                                }
                              />
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  className={cn(
                                    "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-[#ccc] bg-[#fafafa]",
                                    thumb && "border-solid border-[#e3e3e3]"
                                  )}
                                  onClick={() => onUploadImage?.(i)}
                                  title="Upload image"
                                >
                                  {thumb ? (
                                    <SafeImage
                                      src={thumb}
                                      alt=""
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <ImagePlus className="h-4 w-4 text-[#005bd3]" />
                                  )}
                                </button>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[13px] font-medium text-[#303030]">
                                      {variantLabel(v)}
                                    </span>
                                    {thumb ? null : (
                                      <span className="rounded bg-[#e0f0ff] px-1.5 py-0.5 text-[11px] font-medium text-[#005bd3]">
                                        New
                                      </span>
                                    )}
                                  </div>
                                  {trim(v.sku) ? (
                                    <p className="truncate text-[11px] text-[#8a8a8a]">
                                      {v.sku}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <div className="relative">
                                <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[12px] text-[#616161]">
                                  ₹
                                </span>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  value={
                                    price === "" || price == null ? "" : price
                                  }
                                  onChange={(e) =>
                                    updatePricing("sellingPrice", e.target.value)
                                  }
                                  onFocus={() => focusPricing?.("sellingPrice")}
                                  onBlur={() => blurPricing?.("sellingPrice")}
                                  placeholder="0.00"
                                  className="h-8 border-[#e3e3e3] bg-white pl-5"
                                />
                              </div>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <Input
                                type="number"
                                value={v.quantity}
                                onChange={(e) => {
                                  const quantity = e.target.value;
                                  setForm((prev) => ({
                                    ...prev,
                                    variants: prev.variants.map((row, idx) =>
                                      idx === i
                                        ? {
                                            ...row,
                                            quantity:
                                              quantity === ""
                                                ? ""
                                                : Math.max(
                                                    0,
                                                    Number(quantity) || 0
                                                  ),
                                          }
                                        : row
                                    ),
                                  }));
                                }}
                                className="h-8 border-[#e3e3e3] bg-white"
                              />
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeVariantAt(i)}
                                aria-label="Remove variant"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-[12px] text-[#616161]">
                  Total inventory: {totalAvailable} available
                </p>
              </>
            ) : editorOpen || editingSecond ? null : (
              <p className="text-[12px] text-[#8a8a8a]">
                Add option values to create variants.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
