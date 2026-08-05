"use client";

import {
  AccountIcon,
  CartIcon,
  CloseIcon,
  MenuIcon,
} from "@/components/icons/storeIcons";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import CartDrawer from "./CartDrawer";
import { useWishlistStore } from "@/store/useWishlistStore";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";

const NAVBAR_HEIGHT = 56;

const MENU_LINKS = [
  { href: "/all-products", label: "All Products" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];

function DrawerAccountCard({ onClose }) {
  const userInfo = useAuthStore((s) => s.userInfo);
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = Boolean(
    userInfo?.authenticated ||
      userInfo?.token ||
      userInfo?._id ||
      userInfo?.id ||
      userInfo?.phone
  );
  const userName = userInfo?.name || "";
  const userEmail = userInfo?.email || "";
  const userPhone = userInfo?.phone || "";

  if (isAuthenticated) {
    return (
      <div className="mx-2 mb-0 rounded-xl border border-gray-200 bg-[#F8F8F8] p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {userName || "Customer"}
          </p>
          {userEmail ? (
            <p className="mt-0.5 truncate text-xs text-gray-500">{userEmail}</p>
          ) : null}
          {userPhone ? (
            <p className="mt-0.5 truncate text-xs text-gray-500">{userPhone}</p>
          ) : null}
        </div>
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          <Link
            href="/account"
            onClick={onClose}
            className="block rounded-lg px-2 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50"
          >
            My Account
          </Link>
          <Link
            href="/account/orders"
            onClick={onClose}
            className="block rounded-lg px-2 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50"
          >
            My Orders
          </Link>
          <Link
            href="/account/addresses"
            onClick={onClose}
            className="block rounded-lg px-2 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50"
          >
            Saved Addresses
          </Link>
          <Link
            href="/wishlist"
            onClick={onClose}
            className="block rounded-lg px-2 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50"
          >
            Wishlist
          </Link>
          <Link
            href="/account/settings"
            onClick={onClose}
            className="block rounded-lg px-2 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50"
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={() => {
              logout();
              onClose();
            }}
            className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-[#DF1721] transition-colors hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-0 rounded-xl border border-gray-200 bg-[#F8F8F8] p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">Welcome</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
          Sign in to track orders, manage addresses, and checkout faster.
        </p>
      </div>
      <div className="mt-3">
        <Link
          href="/login"
          onClick={onClose}
          className="flex h-10 w-full items-center justify-center rounded-md bg-[#222222] text-[13px] font-semibold text-white transition-colors hover:bg-black"
        >
          Login
        </Link>
      </div>
    </div>
  );
}

const Navbar = () => {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const cartItems = useCartStore((s) => s.cartItems);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const wishlistCount = useWishlistStore((s) => s.items.length);
  const userInfo = useAuthStore((s) => s.userInfo);
  const isAuthenticated = Boolean(
    userInfo?.authenticated ||
      userInfo?.token ||
      userInfo?._id ||
      userInfo?.id ||
      userInfo?.phone
  );
  const userName = userInfo?.name || "";

  const cartCount = cartItems.reduce((n, i) => n + (i.qty || 0), 0);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [overHero, setOverHero] = useState(isHome);

  const closeMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isHome) {
      setOverHero(false);
      return;
    }

    const update = () => {
      const hero = document.querySelector("[data-home-hero]");
      if (!hero) {
        setOverHero(false);
        return;
      }
      const { bottom } = hero.getBoundingClientRect();
      setOverHero(bottom > NAVBAR_HEIGHT);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isHome]);

  const transparent = isHome && overHero && !isMobileMenuOpen;
  const iconTone = transparent ? "text-white" : "text-gray-900";

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[100] w-full border-b transition-[background-color,border-color] duration-300 ${
          transparent
            ? "border-transparent bg-transparent"
            : "border-gray-200 bg-white"
        }`}
      >
        <div className="mx-auto grid h-14 w-full grid-cols-3 items-center px-4 lg:px-8">
          <div className="flex items-center justify-start">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`inline-flex items-center gap-1.5 rounded-lg p-2 text-[12px] font-medium transition-colors md:px-2 md:py-1.5 ${iconTone} ${
                transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
              }`}
              aria-label="Menu"
            >
              <MenuIcon size={18} />
              <span className="hidden md:inline">Menu</span>
            </button>
          </div>

          <div className="flex items-center justify-center">
            <Link href="/" onClick={closeMenu} className="flex items-center">
              <Image
                src={transparent ? "/brand/logo-dark.png" : "/brand/logo.png"}
                alt="URBAN AANA"
                width={96}
                height={34}
                priority
                className="h-8 w-auto object-contain"
              />
            </Link>
          </div>

          <div className="flex items-center justify-end gap-0.5 sm:gap-1">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg p-2 text-[12px] font-medium transition-colors md:px-2 md:py-1.5 ${iconTone} ${
                  transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
                }`}
                aria-label={userName?.split(" ")[0] || "Account"}
              >
                <AccountIcon size={18} />
                <span className="hidden max-w-[5.5rem] truncate md:inline">
                  {userName?.split(" ")[0] || "Account"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg p-2 text-[12px] font-medium transition-colors md:px-2 md:py-1.5 ${iconTone} ${
                  transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
                }`}
                aria-label="Account"
              >
                <AccountIcon size={18} />
                <span className="hidden md:inline">Account</span>
              </button>
            )}

            <Link
              href="/wishlist"
              className={`relative inline-flex items-center gap-1.5 rounded-lg p-2 text-[12px] font-medium transition-colors md:px-2 md:py-1.5 ${iconTone} ${
                transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
              }`}
              aria-label={`Wishlist, ${wishlistCount} items`}
            >
              <span className="relative inline-flex">
                <Heart size={18} strokeWidth={2} />
                {wishlistCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#DF1721] px-0.5 text-[9px] font-bold leading-none text-white ring-1 ring-white"
                  >
                    {wishlistCount > 99 ? "99+" : wishlistCount}
                  </motion.span>
                )}
              </span>
              <span className="hidden md:inline">Wishlist</span>
            </Link>

            <button
              onClick={() => setDrawerOpen(true)}
              className={`relative inline-flex items-center gap-1.5 rounded-lg p-2 text-[12px] font-medium transition-colors md:px-2 md:py-1.5 ${iconTone} ${
                transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
              }`}
              aria-label={`Cart, ${cartCount} items`}
            >
              <span className="relative inline-flex">
                <CartIcon size={18} />
                {cartCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#DF1721] px-0.5 text-[9px] font-bold leading-none text-white ring-1 ring-white"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </motion.span>
                )}
              </span>
              <span className="hidden md:inline">Cart</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Reserve space except on home, where the hero sits under the nav */}
      {!isHome && <div style={{ height: NAVBAR_HEIGHT }} aria-hidden />}

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMenu}
              className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-[160] flex h-dvh max-h-dvh w-full max-w-[320px] flex-col overflow-hidden bg-white shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3.5">
                <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
                <button
                  onClick={closeMenu}
                  className="rounded-full p-2 transition-colors hover:bg-gray-100"
                  aria-label="Close menu"
                >
                  <CloseIcon size={20} className="text-gray-600" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
                <nav>
                  <ul className="divide-y divide-gray-100">
                    {MENU_LINKS.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={closeMenu}
                          className="block px-3 py-3.5 text-[15px] font-medium text-gray-900 transition-colors hover:bg-gray-50"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>

              <div className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                <DrawerAccountCard onClose={closeMenu} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CartDrawer />
    </>
  );
};

export default Navbar;
