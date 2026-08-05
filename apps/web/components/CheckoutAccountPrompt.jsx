"use client";

/**
 * Shown when checkout email is blocked (e.g. staff). Customers no longer need
 * password login — checkout-email mints a session for normal accounts.
 */
export default function CheckoutAccountPrompt({ email, onSkip }) {
  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-[#F9F9F5] p-4">
      <p className="text-[13px] text-gray-800">
        <span className="font-medium">{email}</span> can’t be used for storefront
        checkout. Use a different email to continue.
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="mt-3 text-[13px] text-[#222222] hover:underline"
      >
        Use a different email
      </button>
    </div>
  );
}
