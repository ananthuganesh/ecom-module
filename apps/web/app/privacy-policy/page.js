import PolicyLayout, {
  PolicySection,
  PolicySubSection,
} from "@/components/storefront/PolicyLayout";
import GrievanceOfficerDetails from "@/components/storefront/GrievanceOfficerDetails";
import {
  STORE_JURISDICTION,
  STORE_LEGAL_NAME,
  STORE_WEBSITE,
} from "@/lib/storeContact";

export const metadata = {
  title: "Privacy Policy | Urban Aana",
  description:
    "Urban Aana privacy policy for customers in India — data collection, use, rights, and contact.",
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyLayout title="Privacy Policy">
      <PolicySection id="introduction" number="1" title="Introduction">
        <p>
          {STORE_LEGAL_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
          operates {STORE_WEBSITE} and sells products to customers in{" "}
          {STORE_JURISDICTION}. This Privacy Policy explains how we collect, use,
          store, and protect personal information in connection with our online
          store, in line with applicable Indian laws including the Information
          Technology Act, 2000 and the Digital Personal Data Protection Act, 2023
          (as applicable).
        </p>
        <p>
          By using our website or placing an order, you acknowledge this policy.
          If you do not agree, please do not use the website.
        </p>
      </PolicySection>

      <PolicySection id="information-we-collect" number="2" title="Information We Collect">
        <PolicySubSection id="personal-data" number="2.1" title="Personal Information">
          <p>We may collect personal information you provide, including:</p>
          <ul>
            <li>Name, email address, and mobile number</li>
            <li>Billing and shipping address (including PIN code and state)</li>
            <li>Order details, preferences, and communication history</li>
            <li>Account login details, if you create an account</li>
          </ul>
        </PolicySubSection>

        <PolicySubSection id="automatic-data" number="2.2" title="Automatically Collected Data">
          <p>
            When you browse our site, we may collect technical information such
            as IP address, browser type, device information, pages viewed, and
            approximate location. This helps us operate, secure, and improve the
            store.
          </p>
        </PolicySubSection>

        <PolicySubSection id="payments" number="2.3" title="Payment Information">
          <p>
            Payments are processed by authorised payment partners (such as
            Razorpay or other gateways we enable). Card, UPI, net-banking, and
            wallet details are handled by those partners. We do not store full
            card numbers or UPI credentials on our servers.
          </p>
        </PolicySubSection>
      </PolicySection>

      <PolicySection id="how-we-use" number="3" title="How We Use Information">
        <p>We use personal information for lawful purposes, including to:</p>
        <ul>
          <li>Process, confirm, and fulfil orders</li>
          <li>Arrange shipping and share tracking updates</li>
          <li>Provide customer support and resolve complaints</li>
          <li>Send transactional messages (order, shipping, refund status)</li>
          <li>Prevent fraud, abuse, and unauthorised access</li>
          <li>Comply with tax, accounting, and legal obligations in India</li>
          <li>Improve website performance and shopping experience</li>
        </ul>
        <p>
          We do not sell your personal data. Marketing messages, if any, are
          sent only where permitted and you may opt out of non-essential
          marketing communications.
        </p>
      </PolicySection>

      <PolicySection id="sharing" number="4" title="Sharing & Disclosure">
        <p>We may share limited information with:</p>
        <ul>
          <li>Payment gateways to complete transactions</li>
          <li>Logistics and courier partners for delivery</li>
          <li>IT and service providers who support our store operations</li>
          <li>Government authorities when required by applicable Indian law</li>
        </ul>
        <p>
          Partners receive only what is needed for their role and are expected
          to handle data securely and lawfully.
        </p>
      </PolicySection>

      <PolicySection id="cookies" number="5" title="Cookies & Similar Technologies">
        <p>
          We use cookies and similar technologies for essential site functions
          (such as cart and login sessions), analytics, and performance. You can
          control cookies through your browser settings. Disabling certain
          cookies may affect checkout or account features.
        </p>
      </PolicySection>

      <PolicySection id="security" number="6" title="Data Security & Retention">
        <p>
          We apply reasonable security safeguards to protect personal
          information against unauthorised access, loss, or misuse. No online
          transmission is completely secure.
        </p>
        <p>
          We retain order and customer records for as long as needed for
          fulfilment, support, tax/GST compliance, dispute resolution, and
          legal requirements under Indian law.
        </p>
      </PolicySection>

      <PolicySection id="your-rights" number="7" title="Your Rights">
        <p>
          Subject to applicable law, you may request access, correction, or
          deletion of your personal data, or withdraw consent where processing
          is consent-based. Some records may be retained where legally required
          (for example, invoices and tax records).
        </p>
        <p>
          To exercise these rights, contact us using the details below. We may
          need to verify your identity before acting on a request.
        </p>
      </PolicySection>

      <PolicySection id="children" number="8" title="Children">
        <p>
          Our store is intended for users who can form a legally binding
          contract under Indian law. We do not knowingly collect personal data
          from children without appropriate consent from a parent or guardian.
        </p>
      </PolicySection>

      <PolicySection id="contact" number="9" title="Grievance Officer">
        <p>
          In line with the Consumer Protection (E-Commerce) Rules, 2020 and
          applicable privacy law, the following officer is designated to
          receive privacy questions, data requests, and grievances:
        </p>
        <GrievanceOfficerDetails />
        <p>
          We aim to acknowledge grievances within 48 hours and resolve them
          within one month of receipt, as required under applicable Indian law.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
