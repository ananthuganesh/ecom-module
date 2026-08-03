"use client";

import { CloseIcon } from "@/components/icons/storeIcons";

const getColorHex = (colorName) => {
  const map = {
    black: "#000000",
    blue: "#0000FF",
    white: "#FFFFFF",
    red: "#DF1721",
    pink: "#FFC0CB",
    "off-white": "#F5F2EB",
    "off white": "#F5F2EB",
    "yellow gold": "#E6C98C",
    "rose gold": "#F3C5B5",
    silver: "#C0C0C0",
    gold: "#FFD700",
    green: "#008000",
    purple: "#800080",
    orange: "#FFA500",
    brown: "#A52A2A",
    gray: "#808080",
    grey: "#808080",
    navy: "#000080",
    teal: "#008080",
    maroon: "#800000",
    beige: "#F5F5DC",
  };
  return map[String(colorName || "").toLowerCase()] || "#EEEEEE";
};

function FilterSection({ title, children }) {
  return (
    <div className="mb-7">
      <h3 className="mb-3 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CheckRow({ selected, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 text-left text-[13px] transition ${
        selected ? "font-medium text-black" : "text-gray-500 hover:text-black"
      }`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded border ${
          selected ? "border-black bg-black text-white" : "border-gray-300"
        }`}
      >
        {selected ? <CloseIcon className="h-2.5 w-2.5 text-white" /> : null}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function FilterSidebar({
  filters,
  onFilterChange,
  onClose,
  isOpen,
  facets = {},
}) {
  const sizes = Array.isArray(facets.sizes) ? facets.sizes : [];
  const colors = Array.isArray(facets.colors) ? facets.colors : [];
  const categories = Array.isArray(facets.categories) ? facets.categories : [];
  const fits = Array.isArray(facets.fits) ? facets.fits : [];
  const fabrics = Array.isArray(facets.fabrics) ? facets.fabrics : [];
  const badges = Array.isArray(facets.badges) ? facets.badges : [];
  const priceRanges = Array.isArray(facets.priceRanges) ? facets.priceRanges : [];

  const selected = (type) =>
    String(filters[type] || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  const toggleMultiFilter = (type, value) => {
    const currentValues = selected(type);
    const exists = currentValues.some((v) => v.toLowerCase() === String(value).toLowerCase());
    const newValues = exists
      ? currentValues.filter((v) => v.toLowerCase() !== String(value).toLowerCase())
      : [...currentValues, value];

    const next = { ...filters };
    if (newValues.length > 0) next[type] = newValues.join(",");
    else delete next[type];
    onFilterChange(next);
  };

  const handleSingleFilterChange = (type, value) => {
    const next = { ...filters };
    if (next[type] === value) delete next[type];
    else next[type] = value;
    onFilterChange(next);
  };

  const hasAnyFacet =
    sizes.length > 0 ||
    colors.length > 0 ||
    categories.length > 0 ||
    fits.length > 0 ||
    fabrics.length > 0 ||
    badges.length > 0 ||
    priceRanges.length > 0;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] border-r border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-in-out lg:sticky lg:top-24 lg:z-0 lg:mt-0 lg:h-[calc(100vh-7rem)] lg:w-56 lg:shrink-0 lg:translate-x-0 lg:border-0 lg:shadow-none ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="custom-scrollbar relative flex h-full flex-col overflow-y-auto px-5 pb-8 lg:px-0 lg:pr-2">
        <div className="sticky top-0 z-10 mb-5 flex items-center justify-between border-b border-gray-100 bg-white py-4 lg:pt-0">
          <span className="text-[12px] font-semibold text-black">Filters</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 transition hover:bg-gray-50 lg:hidden"
            aria-label="Close filters"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {!hasAnyFacet ? (
          <p className="text-[13px] text-gray-400">No filters available yet.</p>
        ) : null}

        {sizes.length > 0 ? (
          <FilterSection title="Size">
            <div className="flex flex-wrap gap-1.5">
              {sizes.map((size) => {
                const isSelected = selected("size").some(
                  (v) => v.toLowerCase() === size.toLowerCase()
                );
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleMultiFilter("size", size)}
                    className={`min-w-[2.25rem] rounded-md border px-2 py-1.5 text-[12px] font-semibold uppercase transition ${
                      isSelected
                        ? "border-black bg-black text-white"
                        : "border-gray-200 text-gray-600 hover:border-black hover:text-black"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </FilterSection>
        ) : null}

        {colors.length > 0 ? (
          <FilterSection title="Colour">
            <div className="space-y-2.5">
              {colors.map((color) => {
                const isSelected = selected("color").some(
                  (v) => v.toLowerCase() === color.toLowerCase()
                );
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleMultiFilter("color", color)}
                    className="group flex w-full items-center gap-2.5 text-left"
                  >
                    <span
                      className={`h-4 w-4 rounded-full border ${
                        isSelected
                          ? "border-black ring-1 ring-black ring-offset-1"
                          : "border-gray-200"
                      }`}
                      style={{ backgroundColor: getColorHex(color) }}
                    />
                    <span
                      className={`truncate text-[13px] capitalize transition ${
                        isSelected
                          ? "font-medium text-black"
                          : "text-gray-500 group-hover:text-black"
                      }`}
                    >
                      {color}
                    </span>
                  </button>
                );
              })}
            </div>
          </FilterSection>
        ) : null}

        {categories.length > 0 ? (
          <FilterSection title="Category">
            <div className="space-y-2.5">
              {categories.map((category) => (
                <CheckRow
                  key={category}
                  label={category}
                  selected={selected("category").some(
                    (v) => v.toLowerCase() === category.toLowerCase()
                  )}
                  onClick={() => toggleMultiFilter("category", category)}
                />
              ))}
            </div>
          </FilterSection>
        ) : null}

        {fits.length > 0 ? (
          <FilterSection title="Fit">
            <div className="space-y-2.5">
              {fits.map((fit) => (
                <CheckRow
                  key={fit}
                  label={fit}
                  selected={selected("fit").some(
                    (v) => v.toLowerCase() === fit.toLowerCase()
                  )}
                  onClick={() => toggleMultiFilter("fit", fit)}
                />
              ))}
            </div>
          </FilterSection>
        ) : null}

        {fabrics.length > 0 ? (
          <FilterSection title="Fabric">
            <div className="space-y-2.5">
              {fabrics.map((fabric) => (
                <CheckRow
                  key={fabric}
                  label={fabric}
                  selected={selected("fabric").some(
                    (v) => v.toLowerCase() === fabric.toLowerCase()
                  )}
                  onClick={() => toggleMultiFilter("fabric", fabric)}
                />
              ))}
            </div>
          </FilterSection>
        ) : null}

        {badges.length > 0 ? (
          <FilterSection title="Collection">
            <div className="space-y-2.5">
              {badges.map((badge) => (
                <CheckRow
                  key={badge.value}
                  label={badge.label}
                  selected={selected("badge").includes(badge.value)}
                  onClick={() => toggleMultiFilter("badge", badge.value)}
                />
              ))}
            </div>
          </FilterSection>
        ) : null}

        {priceRanges.length > 0 ? (
          <FilterSection title="Price">
            <div className="space-y-2.5">
              {priceRanges.map((range) => (
                <CheckRow
                  key={range.value}
                  label={range.label}
                  selected={filters.priceRange === range.value}
                  onClick={() => handleSingleFilterChange("priceRange", range.value)}
                />
              ))}
            </div>
          </FilterSection>
        ) : null}

        <button
          type="button"
          onClick={() => onFilterChange({})}
          className="mt-auto text-left text-[12px] font-semibold text-[#DF1721] transition hover:underline"
        >
          Clear all
        </button>
      </div>
    </aside>
  );
}
