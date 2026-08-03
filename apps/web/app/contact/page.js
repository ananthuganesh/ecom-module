"use client";

import Image from "next/image";
import { useState } from "react";
import {
  STORE_EMAIL,
  STORE_PHONE,
  STORE_PHONE_TEL,
} from "@/lib/storeContact";

const CONTACT_IMAGE = "/images/44.jpg";

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3.5 py-3 text-sm text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const subject = encodeURIComponent(
      name.trim() ? `Urban Aana inquiry from ${name.trim()}` : "Urban Aana inquiry"
    );
    const body = encodeURIComponent(
      [
        `Name: ${name.trim() || "—"}`,
        `Email: ${email.trim() || "—"}`,
        `Phone: ${phone.trim() || "—"}`,
        "",
        message.trim() || "—",
      ].join("\n")
    );
    window.location.href = `mailto:${STORE_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-2">
        {/* Left — image */}
        <div className="relative min-h-[42vh] overflow-hidden bg-gray-100 lg:min-h-full lg:sticky lg:top-0 lg:h-[calc(100vh-5rem)]">
          <Image
            src={CONTACT_IMAGE}
            alt="Urban Aana"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-black/10" />
          <div className="absolute bottom-6 left-6 right-6 text-white lg:bottom-10 lg:left-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/80">
              Urban Aana
            </p>
            <p className="mt-2 max-w-xs text-lg font-medium leading-snug">
              Crafted in India. Built for Kerala.
            </p>
          </div>
        </div>

        {/* Right — title + form */}
        <div className="flex items-center px-5 py-12 sm:px-10 md:px-14 lg:px-16 lg:py-16">
          <div className="mx-auto w-full max-w-md">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
              Get in touch
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Contact
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              Questions about orders, fit, or shipping — send a message and
              we’ll reply as soon as we can.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label
                  htmlFor="contact-name"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500"
                >
                  Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-email"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500"
                >
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-phone"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500"
                >
                  Phone
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldClass}
                  placeholder="+91"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-message"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={`${fieldClass} resize-y min-h-[120px]`}
                  placeholder="Order number, question, or feedback…"
                />
              </div>

              <button
                type="submit"
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-black px-5 py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#DF1721]"
              >
                Send message
              </button>

              {sent ? (
                <p className="text-sm text-gray-500" role="status">
                  Opening your email app to send to {STORE_EMAIL}…
                </p>
              ) : null}
            </form>

            <div className="mt-10 space-y-2 border-t border-gray-200 pt-6 text-sm text-gray-500">
              <p>
                Or email{" "}
                <a
                  href={`mailto:${STORE_EMAIL}`}
                  className="font-medium text-black hover:text-[#DF1721]"
                >
                  {STORE_EMAIL}
                </a>
              </p>
              <p>
                Call{" "}
                <a
                  href={`tel:${STORE_PHONE_TEL}`}
                  className="font-medium text-black hover:text-[#DF1721]"
                >
                  {STORE_PHONE}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
