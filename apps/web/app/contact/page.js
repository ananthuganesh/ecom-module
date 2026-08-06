"use client";

import Image from "next/image";
import { useState } from "react";
import { contactService } from "@/api";
import {
  STORE_EMAIL,
  STORE_PHONE,
  STORE_PHONE_TEL,
} from "@/lib/storeContact";

const CONTACT_IMAGE = "/images/44.jpg";

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3.5 py-3 text-sm text-black outline-none transition-colors placeholder:text-gray-400 focus:border-black";

function apiErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg).filter(Boolean).join(" ") || fallback;
  }
  return err?.response?.data?.message || fallback;
}

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState({ type: "", text: "" });

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setStatus({ type: "", text: "" });
    try {
      await contactService.submit({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: message.trim(),
      });
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setStatus({
        type: "success",
        text: "Message sent. We’ll get back to you soon.",
      });
    } catch (err) {
      setStatus({
        type: "error",
        text: apiErrorMessage(
          err,
          "Could not send your message. Please try again or email us directly."
        ),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-2">
        {/* Left — image */}
        <div className="relative min-h-[42vh] overflow-hidden bg-gray-100 lg:sticky lg:top-0 lg:h-[calc(100vh-5rem)] lg:min-h-full">
          <Image
            src={CONTACT_IMAGE}
            alt="Urban Aana"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        {/* Right — title + form */}
        <div className="flex items-center px-5 py-12 sm:px-10 md:px-14 lg:px-16 lg:py-16">
          <div className="mx-auto w-full max-w-md">
            <h1 className="text-2xl font-bold tracking-tight md:text-4xl">
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
                  className="mb-1.5 block text-[11px] font-bold tracking-[0.16em] text-gray-500 uppercase"
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
                  className="mb-1.5 block text-[11px] font-bold tracking-[0.16em] text-gray-500 uppercase"
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
                  className="mb-1.5 block text-[11px] font-bold tracking-[0.16em] text-gray-500 uppercase"
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
                  className="mb-1.5 block text-[11px] font-bold tracking-[0.16em] text-gray-500 uppercase"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={`${fieldClass} min-h-[120px] resize-y`}
                  placeholder="Order number, question, or feedback…"
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-black px-5 py-3.5 text-[12px] font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-[#DF1721] disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send message"}
              </button>

              {status.text ? (
                <p
                  className={`text-sm ${
                    status.type === "success" ? "text-emerald-700" : "text-red-600"
                  }`}
                  role="status"
                >
                  {status.text}
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
