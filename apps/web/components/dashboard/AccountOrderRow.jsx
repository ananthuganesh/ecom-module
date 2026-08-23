import SafeImage from "@/components/SafeImage";
import { formatOrderNumber } from "@/utils/formatOrderNumber";

function formatPrice(price) {
  return `₹${Number(price || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AccountOrderRow({ order }) {
  const fields = [
    {
      label: "Order Number",
      value: formatOrderNumber(order, 8) || "—",
    },
    {
      label: "Date",
      value: new Date(order.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    },
    {
      label: "Status",
      value: String(order.orderStatus || order.status || "Order placed"),
      valueClassName: "capitalize",
    },
    {
      label: "Amount",
      value: formatPrice(order.totalPrice || order.finalPrice),
    },
  ];

  return (
    <div className="flex items-start gap-4 px-5 py-5 sm:items-center sm:px-6">
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100">
        <SafeImage
          src={
            order.orderItems?.[0]?.image ||
            order.items?.[0]?.productId?.thumbnails?.[0]
          }
          alt="order"
          fill
          className="object-cover"
        />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {fields.map((field) => (
          <div key={field.label}>
            <p className="text-[11px] text-gray-500">{field.label}</p>
            <p
              className={`mt-0.5 text-[13px] font-semibold text-gray-900 ${field.valueClassName || ""}`}
            >
              {field.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
