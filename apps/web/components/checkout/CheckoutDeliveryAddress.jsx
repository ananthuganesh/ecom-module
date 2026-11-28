"use client";

/**
 * Delivery address picker for checkout.
 * - Saved addresses → select one
 * - Or add a new address (optionally saved to account)
 */

function addressId(addr, index = 0) {
  return String(addr?.id || `legacy-${index}`);
}

function formatAddrLines(addr) {
  if (!addr) return "";
  const street = addr.house || addr.address || "";
  const cityLine = [addr.city, addr.state, addr.pincode || addr.postalCode]
    .filter(Boolean)
    .join(", ");
  return [street, cityLine].filter(Boolean).join("\n");
}

export function savedAddressToFormPatch(addr) {
  if (!addr) return {};
  return {
    address: addr.house || addr.address || "",
    city: addr.city || "",
    state: addr.state || "",
    postalCode: String(addr.pincode || addr.postalCode || "").replace(/\D/g, "").slice(0, 6),
    phone: addr.phone || undefined,
    name: addr.name || undefined,
  };
}

export default function CheckoutDeliveryAddress({
  addresses = [],
  selectedId,
  onSelectSaved,
  deliveryMode, // "saved" | "new"
  onModeChange,
  saveToAccount,
  onSaveToAccountChange,
  showSaveToggle = true,
  children, // new-address form fields
}) {
  const list = Array.isArray(addresses) ? addresses : [];
  const hasSaved = list.length > 0;

  if (!hasSaved) {
    return (
      <div className="space-y-3">
        {children}
        {showSaveToggle ? (
          <label className="flex items-start gap-2 text-[13px] text-gray-600">
            <input
              type="checkbox"
              checked={saveToAccount}
              onChange={(e) => onSaveToAccountChange?.(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span>Save this address to my account for next time</span>
          </label>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {list.map((addr, index) => {
          const id = addressId(addr, index);
          const selected = deliveryMode === "saved" && selectedId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                onModeChange?.("saved");
                onSelectSaved?.(addr, id);
              }}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selected
                  ? "border-black bg-[#FAFAFA] ring-1 ring-black"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-black" : "border-gray-300"
                  }`}
                  aria-hidden
                >
                  {selected ? (
                    <span className="h-2 w-2 rounded-full bg-black" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-gray-900">
                      {addr.label || addr.name || `Address ${index + 1}`}
                    </span>
                    {addr.isDefault ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gray-600 uppercase">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block whitespace-pre-line text-[13px] leading-relaxed text-gray-600">
                    {formatAddrLines(addr)}
                  </span>
                  {addr.phone ? (
                    <span className="mt-1 block text-[12px] text-gray-500">
                      Phone: {addr.phone}
                    </span>
                  ) : null}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onModeChange?.("new")}
        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
          deliveryMode === "new"
            ? "border-black bg-[#FAFAFA] ring-1 ring-black"
            : "border-dashed border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <span className="flex items-center gap-3">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              deliveryMode === "new" ? "border-black" : "border-gray-300"
            }`}
            aria-hidden
          >
            {deliveryMode === "new" ? (
              <span className="h-2 w-2 rounded-full bg-black" />
            ) : null}
          </span>
          <span className="text-[14px] font-semibold text-gray-900">
            Deliver to a new address
          </span>
        </span>
      </button>

      {deliveryMode === "new" ? (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          {children}
          {showSaveToggle ? (
            <label className="flex items-start gap-2 text-[13px] text-gray-600">
              <input
                type="checkbox"
                checked={saveToAccount}
                onChange={(e) => onSaveToAccountChange?.(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>Save this address to my account for next time</span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
