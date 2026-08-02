"use client";

import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import {
  STORE_EMAIL,
  STORE_PHONE,
  STORE_PHONE_TEL,
} from "@/lib/storeContact";

export default function ContactPage() {
  const mailto = `mailto:${STORE_EMAIL}?subject=${encodeURIComponent("Urban Aana inquiry")}`;

  return (
    <main className="min-h-screen bg-white">
      <section className="container-site py-12 md:py-20">
        <div className="mb-12 border-b-2 border-black pb-6">
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-brand-red">Get in touch</p>
          <h1 className="mt-2 font-vina text-5xl uppercase leading-none sm:text-7xl">Contact</h1>
          <p className="mt-3 max-w-xl text-sm text-gray-500">
            Questions about orders, drops, or fit — write to the Urban Aana team.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="flex gap-4 border border-black bg-[#F9F9F5] p-5">
              <div className="mt-0.5">
                <MapPin className="h-5 w-5 text-brand-red" />
              </div>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand-red">Location</p>
                <p className="mt-1 text-sm font-medium text-black">Crafted in India</p>
              </div>
            </div>

            <div className="flex gap-4 border border-black bg-[#F9F9F5] p-5">
              <div className="mt-0.5">
                <Mail className="h-5 w-5 text-brand-red" />
              </div>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand-red">Email</p>
                <a
                  href={mailto}
                  className="mt-1 block text-sm font-medium text-black hover:text-brand-red"
                >
                  {STORE_EMAIL}
                </a>
              </div>
            </div>

            <div className="flex gap-4 border border-black bg-[#F9F9F5] p-5">
              <div className="mt-0.5">
                <Phone className="h-5 w-5 text-brand-red" />
              </div>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand-red">Phone</p>
                <a
                  href={`tel:${STORE_PHONE_TEL}`}
                  className="mt-1 block text-sm font-medium text-black hover:text-brand-red"
                >
                  {STORE_PHONE}
                </a>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <a
                href="https://www.instagram.com/urbanaana.in"
                target="_blank"
                rel="noreferrer"
                className="grid h-10 w-10 place-items-center border border-black text-black transition-colors hover:bg-brand-red hover:text-white hover:border-brand-red"
                aria-label="Instagram"
              >
                <Instagram size={16} />
              </a>
              <a
                href="https://www.facebook.com/share/18vF3ZB3BJ/"
                target="_blank"
                rel="noreferrer"
                className="grid h-10 w-10 place-items-center border border-black text-black transition-colors hover:bg-brand-red hover:text-white hover:border-brand-red"
                aria-label="Facebook"
              >
                <Facebook size={16} />
              </a>
            </div>
          </div>

          <div className="border-2 border-black bg-white p-6 sm:p-8 flex flex-col justify-center">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand-red">Email us</h2>
            <p className="mt-3 text-sm text-gray-600 leading-relaxed">
              Prefer email? Reach us directly and we’ll reply as soon as we can.
            </p>
            <a
              href={mailto}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-black py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-red"
            >
              <Mail size={14} /> Write to {STORE_EMAIL}
            </a>
            <a
              href={`tel:${STORE_PHONE_TEL}`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-black py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-white"
            >
              <Phone size={14} /> Call {STORE_PHONE}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
