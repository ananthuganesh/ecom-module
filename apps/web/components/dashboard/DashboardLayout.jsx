"use client";

import { motion } from "framer-motion";

/**
 * Account shell — aligned with cart / collection / checkout storefront chrome.
 */
export default function DashboardLayout({ children, title }) {
  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto w-full max-w-6xl px-4 py-8 md:px-4 md:py-12 lg:px-8">
        {title ? (
          <header className="mb-8 md:mb-10">
            <h1 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case text-gray-900 md:text-4xl">
              {title}
            </h1>
          </header>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {children}
        </motion.div>
      </section>
    </div>
  );
}
