"use client";

import CustomerOtpForm from "@/components/auth/CustomerOtpForm";

/**
 * Shown when checkout can't continue with this email yet.
 * - Returning customer: verify with an emailed code, then checkout resumes.
 *   Without this, anyone typing their email would open their account.
 * - Staff email: can't be used for storefront checkout.
 */
export default function CheckoutAccountPrompt({ email, onSkip, verifyWithCode = false, onVerified }) {
  if (verifyWithCode) {
    return (
      <div className="mt-3 rounded-md border border-gray-200 bg-[#F9F9F5] p-4">
        <p className="text-[13px] font-medium text-gray-900">Welcome back</p>
        <CustomerOtpForm
          fixedEmail={email}
          idPrefix="checkout-otp"
          successToast="Email verified"
          className="mt-1"
          inputClassName="h-10"
          buttonClassName="h-10"
          onSuccess={onVerified}
        />
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
