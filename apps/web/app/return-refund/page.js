import PolicyLayout, {
  PolicySection,
  PolicySubSection,
} from "@/components/storefront/PolicyLayout";
import GrievanceOfficerDetails from "@/components/storefront/GrievanceOfficerDetails";
import {
  STORE_EMAIL,
  STORE_LEGAL_NAME,
  STORE_PHONE,
  STORE_PHONE_TEL,
} from "@/lib/storeContact";
import { canonicalUrl } from "@/lib/siteUrl";

export const metadata = {
  title: "Returns & Shipping",
  description:
    "Urban Aana shipping, returns, and refund policy for customers in India.",
  alternates: { canonical: canonicalUrl("/return-refund") },
};

export default function ReturnsAndShippingPage() {
  return (
    <PolicyLayout title="Returns & Shipping">
      <PolicySection id="introduction" number="1" title="Introduction">
        <p>
          This policy explains how {STORE_LEGAL_NAME} ships orders within India
          and how returns, exchanges, and refunds are handled. It is intended to
          be clear and fair for customers shopping online in India.
        </p>
        <p>Policy effective: 2025</p>
      </PolicySection>

      <PolicySection id="shipping-coverage" number="2" title="Shipping Coverage">
        <p>
          We deliver across India through trusted courier partners.
          International shipping is not available unless we announce it
          separately.
        </p>
        <p>
          Please provide a complete address with PIN code, landmark (if any),
          and an active mobile number so delivery partners can reach you.
        </p>
      </PolicySection>

      <PolicySection id="processing" number="3" title="Order Processing & Delivery">
        <PolicySubSection id="processing-time" number="3.1" title="Processing">
          <p>
            After successful payment and confirmation, orders are packed and
            handed to the courier as quickly as stock and order volume allow.
            Orders placed on weekends or public holidays may be processed on the
            next working day.
          </p>
        </PolicySubSection>
        <PolicySubSection id="delivery-time" number="3.2" title="Delivery Timelines">
          <p>
            Delivery usually takes a few business days after dispatch, depending
            on your city/town and courier serviceability. Any estimate shown at
            checkout is indicative and not a guaranteed delivery date.
          </p>
        </PolicySubSection>
        <PolicySubSection id="tracking" number="3.3" title="Tracking">
          <p>
            Tracking details are shared by SMS/email/WhatsApp (where available)
            once the shipment is created. Use the tracking ID to follow status
            until delivery.
          </p>
        </PolicySubSection>
        <PolicySubSection id="charges" number="3.4" title="Shipping Charges">
          <p>
            Shipping may be free or paid based on cart value and offers active
            at checkout. Unless stated otherwise, prepaid shipping charges are
            non-refundable except where the product is defective, damaged in
            transit, or incorrect.
          </p>
        </PolicySubSection>
      </PolicySection>

      <PolicySection id="delivery-issues" number="4" title="Delivery Issues">
        <ul>
          <li>
            Please check the parcel on delivery for visible damage before
            accepting, where possible
          </li>
          <li>
            Report damaged, defective, or wrong items within{" "}
            <strong>48 hours</strong> of delivery
          </li>
          <li>
            If tracking shows &quot;delivered&quot; but you did not receive the
            order, contact us the same day with your order number
          </li>
          <li>
            Failed delivery due to incorrect/incomplete address or unreachable
            phone may lead to return-to-origin; re-shipping may attract extra
            charges
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="eligibility" number="5" title="Return Eligibility">
        <p>
          For size/fit or change-of-mind returns (where accepted), all of the
          following must apply:
        </p>
        <ul>
          <li>Item is unused, unworn, unwashed, and in original condition</li>
          <li>Original tags and packaging are intact</li>
          <li>
            Return request is raised within <strong>7 days</strong> of delivery
          </li>
          <li>Proof of purchase / order number is provided</li>
        </ul>
        <p>
          Apparel being a personal-use category, hygiene and condition checks
          apply before approval.
        </p>
      </PolicySection>

      <PolicySection id="non-returnable" number="6" title="Non-Returnable Items">
        <p>Unless the item is defective or wrongly shipped, we generally do not accept returns of:</p>
        <ul>
          <li>Sale / clearance / heavily discounted items marked final sale</li>
          <li>Gift cards or promotional vouchers</li>
          <li>Customised or limited-edition pieces (if stated at purchase)</li>
          <li>Items that are worn, washed, altered, stained, or damaged by the customer</li>
        </ul>
      </PolicySection>

      <PolicySection id="how-to-request" number="7" title="How to Request a Return">
        <PolicySubSection id="step-a" number="7.1" title="Raise a Request">
          <p>
            Email <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a> or call{" "}
            <a href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE}</a> with your order
            number, product details, reason for return, and clear photos if the
            item is damaged/defective.
          </p>
        </PolicySubSection>
        <PolicySubSection id="step-b" number="7.2" title="Await Confirmation">
          <p>
            Do not ship the product back until our team confirms the return and
            shares instructions (pickup or self-ship, as applicable).
          </p>
        </PolicySubSection>
        <PolicySubSection id="step-c" number="7.3" title="Return Shipment">
          <p>
            Pack the item securely with all original contents. For approved
            change-of-mind/size returns, return shipping may be payable by the
            customer unless we arrange a pickup offer. For verified
            damaged/defective/wrong items, return logistics will be arranged by
            us at no extra cost.
          </p>
        </PolicySubSection>
      </PolicySection>

      <PolicySection id="refund" number="8" title="Refund Process">
        <p>
          After we receive and quality-check the returned item, we will notify
          you by email/phone. Approved refunds are initiated within{" "}
          <strong>5–7 business days</strong> to the original payment method
          (UPI/card/net-banking/wallet as used at checkout). Bank or gateway
          timelines may add a few additional working days before credit appears.
        </p>
        <p>
          Cash-on-delivery refunds, where applicable, are processed to a bank
          account/UPI details shared by you after verification.
        </p>
        <p>
          Prepaid shipping charges are non-refundable except for defective,
          damaged, or incorrect items.
        </p>
      </PolicySection>

      <PolicySection id="exchanges" number="9" title="Exchanges">
        <p>
          We currently do not offer direct exchanges. To get a different size or
          colour, return the eligible item and place a new order for the
          preferred variant (subject to stock).
        </p>
      </PolicySection>

      <PolicySection id="damaged" number="10" title="Damaged, Defective or Wrong Items">
        <p>
          If you receive a damaged, defective, or incorrect product, contact us
          within <strong>48 hours</strong> of delivery with photos/video and
          your order number. After verification, we will arrange a replacement
          (subject to stock) or a full refund, including applicable shipping
          where we are at fault.
        </p>
      </PolicySection>

      <PolicySection id="consumer-rights" number="11" title="Consumer Rights">
        <p>
          Nothing in this policy limits your statutory rights under the Consumer
          Protection Act, 2019 and other applicable Indian laws. For unresolved
          grievances, you may also approach the appropriate consumer forum.
        </p>
      </PolicySection>

      <PolicySection id="contact" number="12" title="Grievance Officer">
        <p>
          For shipping, return, or refund support, contact our Grievance Officer
          (Consumer Protection (E-Commerce) Rules, 2020):
        </p>
        <GrievanceOfficerDetails />
        <p>
          Please include your order number in every support request so we can
          respond faster. We aim to acknowledge grievances within 48 hours and
          resolve them within one month of receipt.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
