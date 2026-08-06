import Link from "next/link";

/**
 * Document-style policy layout — title, update date, and content body.
 */
export default function PolicyLayout({
  title,
  updatedAt = "August 2, 2026",
  children,
}) {
  return (
    <main className="min-h-screen bg-white text-[#111111]">
      <div className="mx-auto w-full max-w-5xl px-4 py-12 md:px-8 md:py-16 lg:px-10 lg:py-20">
        <header className="mb-10 border-b border-gray-200 pb-8 md:mb-14 md:pb-10">
          <h1 className="text-2xl font-bold tracking-tight text-black md:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-sm text-gray-500">
            Latest update: {updatedAt}
          </p>
        </header>

        <article className="policy-prose">{children}</article>

        <div className="mt-16 flex flex-wrap gap-3 pt-2">
          <Link
            href="/all-products"
            className="inline-flex rounded-lg border border-black px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-black hover:text-white"
          >
            Back to Shop
          </Link>
          <Link
            href="/contact"
            className="inline-flex rounded-lg bg-black px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#DF1721]"
          >
            Contact Us
          </Link>
        </div>
      </div>

      <style>{`
        .policy-prose h2 {
          scroll-margin-top: 6rem;
          margin: 2.25rem 0 0.85rem;
          font-size: 1.25rem;
          line-height: 1.3;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #111;
        }
        .policy-prose h2:first-child {
          margin-top: 0;
        }
        .policy-prose h3 {
          scroll-margin-top: 6rem;
          margin: 1.5rem 0 0.65rem;
          font-size: 1rem;
          line-height: 1.35;
          font-weight: 700;
          color: #111;
        }
        .policy-prose p {
          margin: 0 0 1rem;
          font-size: 0.95rem;
          line-height: 1.75;
          color: #4b5563;
        }
        .policy-prose ul {
          margin: 0 0 1.25rem;
          padding-left: 1.25rem;
          list-style: disc;
        }
        .policy-prose li {
          margin: 0.4rem 0;
          font-size: 0.95rem;
          line-height: 1.7;
          color: #4b5563;
        }
        .policy-prose a {
          color: #111;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .policy-prose a:hover {
          color: #df1721;
        }
        .policy-prose strong {
          color: #111;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}

export function PolicySection({ id, number, title, children }) {
  return (
    <section id={id}>
      <h2>
        {number}. {title}
      </h2>
      {children}
    </section>
  );
}

export function PolicySubSection({ id, number, title, children }) {
  return (
    <div id={id}>
      <h3>
        {number}. {title}
      </h3>
      {children}
    </div>
  );
}
