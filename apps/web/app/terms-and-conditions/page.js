import PolicyLayout, {
  PolicySection,
  PolicySubSection,
} from "@/components/storefront/PolicyLayout";
import {
  STORE_EMAIL,
  STORE_JURISDICTION,
  STORE_LEGAL_NAME,
  STORE_PHONE,
  STORE_PHONE_TEL,
  STORE_WEBSITE,
} from "@/lib/storeContact";

export const metadata = {
  title: "Terms and Conditions | Urban Aana",
  description:
    "Terms and conditions for shopping on Urban Aana — orders, payments, liability, and Indian governing law.",
};

export default function TermsPage() {
  return (
    <PolicyLayout title="Terms and Conditions">
      <PolicySection id="introduction" number="1" title="Introduction">
        <p>
          These Terms and Conditions (&quot;Terms&quot;) govern your use of{" "}
          {STORE_WEBSITE} and purchases from {STORE_LEGAL_NAME}. By accessing
          the website or placing an order, you agree to these Terms and our
          related policies (Privacy Policy and Returns &amp; Shipping).
        </p>
        <p>
          These Terms are published in accordance with applicable Indian laws,
          including the Consumer Protection Act, 2019 and the Consumer
          Protection (E-Commerce) Rules, 2020, as applicable.
        </p>
      </PolicySection>

      <PolicySection id="using-the-site" number="2" title="Using the Website">
        <PolicySubSection id="eligibility" number="2.1" title="Eligibility">
          <p>
            You confirm that you are competent to contract under the Indian
            Contract Act, 1872 (generally 18 years or older), and that
            information you provide is accurate and complete.
          </p>
        </PolicySubSection>
        <PolicySubSection id="account" number="2.2" title="Account Responsibility">
          <p>
            If you create an account, you are responsible for safeguarding your
            login credentials and for activity under your account. Notify us
            promptly of any unauthorised use.
          </p>
        </PolicySubSection>
        <PolicySubSection id="acceptable-use" number="2.3" title="Acceptable Use">
          <p>
            You agree not to misuse the website, attempt unauthorised access,
            scrape content unlawfully, or interfere with store operations.
          </p>
        </PolicySubSection>
      </PolicySection>

      <PolicySection id="products" number="3" title="Products & Descriptions">
        <p>
          Product images and descriptions are for representation. Minor
          variations in colour, fabric texture, or finish may occur due to
          lighting, display settings, or manufacturing tolerances. Prices are
          shown in Indian Rupees (INR) and are inclusive or exclusive of taxes
          as indicated at checkout.
        </p>
      </PolicySection>

      <PolicySection id="orders" number="4" title="Orders, Payment & Cancellation">
        <PolicySubSection id="order-acceptance" number="4.1" title="Order Acceptance">
          <p>
            An order is accepted after successful payment (or confirmation for
            permitted payment methods) and stock verification. We may cancel an
            order in case of pricing errors, stock unavailability, failed
            payment verification, suspected fraud, or force majeure.
          </p>
        </PolicySubSection>
        <PolicySubSection id="payments" number="4.2" title="Payments">
          <p>
            We accept payments through authorised Indian payment methods enabled
            on the site (for example UPI, cards, net-banking, wallets, or other
            options shown at checkout). Payment processing is handled by
            third-party gateways.
          </p>
        </PolicySubSection>
        <PolicySubSection id="customer-cancel" number="4.3" title="Customer Cancellation">
          <p>
            Once an order is confirmed and processing has begun, cancellation
            may not always be possible. Contact us immediately at{" "}
            <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a>. If the order has
            already shipped, our Returns &amp; Shipping policy applies.
          </p>
        </PolicySubSection>
      </PolicySection>

      <PolicySection id="pricing" number="5" title="Pricing, Offers & GST">
        <p>
          Prices and offers may change without notice before order confirmation.
          Applicable taxes (including GST, where chargeable) are calculated as
          shown during checkout. Coupon codes are subject to their stated
          conditions and may be withdrawn at any time.
        </p>
      </PolicySection>

      <PolicySection id="shipping-returns" number="6" title="Shipping & Returns">
        <p>
          Delivery timelines, shipping charges, returns, refunds, and exchanges
          are governed by our{" "}
          <a href="/return-refund">Returns &amp; Shipping</a> policy, which forms
          part of these Terms.
        </p>
      </PolicySection>

      <PolicySection id="ip" number="7" title="Intellectual Property">
        <p>
          All content on this website — including brand name, logos, product
          imagery, text, and design — is owned by {STORE_LEGAL_NAME} or its
          licensors. You may not copy, reproduce, or use it commercially without
          prior written permission.
        </p>
      </PolicySection>

      <PolicySection id="liability" number="8" title="Limitation of Liability">
        <p>
          To the fullest extent permitted by Indian law, {STORE_LEGAL_NAME} is
          not liable for indirect or consequential losses, courier delays beyond
          our control, or issues arising from incorrect address or contact
          details provided by you. Nothing in these Terms limits rights that
          cannot be excluded under the Consumer Protection Act, 2019.
        </p>
      </PolicySection>

      <PolicySection id="governing-law" number="9" title="Governing Law & Jurisdiction">
        <p>
          These Terms are governed by the laws of {STORE_JURISDICTION}. Courts
          in India shall have jurisdiction over disputes, subject to consumer
          forum rights available under applicable law.
        </p>
      </PolicySection>

      <PolicySection id="changes" number="10" title="Changes to These Terms">
        <p>
          We may update these Terms from time to time. The &quot;Latest
          update&quot; date on this page reflects the current version. Continued
          use of the website after changes means you accept the updated Terms.
        </p>
      </PolicySection>

      <PolicySection id="contact" number="11" title="Customer Support / Grievance">
        <p>For order issues, complaints, or questions about these Terms:</p>
        <ul>
          <li>
            Email: <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a>
          </li>
          <li>
            Phone: <a href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE}</a>
          </li>
        </ul>
      </PolicySection>
    </PolicyLayout>
  );
}
