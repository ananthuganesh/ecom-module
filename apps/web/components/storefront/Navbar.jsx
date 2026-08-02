"use client";

import {
  AccountIcon,
  BagIcon,
  CartIcon,
  HeartBagIcon,
  LocationIcon,
  LogOutIcon,
  MenuIcon,
  OrdersIcon,
  StoreIcon,
} from "@/components/icons/storeIcons";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import CartDrawer from "./CartDrawer";
import { motion, AnimatePresence } from "framer-motion";

const NAVBAR_HEIGHT = 56;

const Navbar = () => {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const cartItems = useCartStore((s) => s.cartItems);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const userInfo = useAuthStore((s) => s.userInfo);
  const logout = useAuthStore((s) => s.logout);

  const isAuthenticated = Boolean(userInfo?.authenticated || userInfo?.token || userInfo?._id || userInfo?.id || userInfo?.phone);
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
        <div className="mx-auto grid h-14 w-full grid-cols-3 items-center px-2 md:px-4 lg:px-8">
          <div className="flex items-center justify-start">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${iconTone} ${
                transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
              }`}
              aria-label="Menu"
            >
              <MenuIcon size={18} />
              <span>Menu</span>
            </button>
          </div>

          <div className="flex items-center justify-center">
            <Link href="/" onClick={closeMenu} className="flex items-center">
              <Image
                src={transparent ? "/brand/logo-dark.png" : "/brand/logo.png"}
                alt="URBAN AANA"
                width={100}
                height={36}
                priority
                className="object-contain py-1"
              />
            </Link>
          </div>

          <div className="flex items-center justify-end gap-0.5 sm:gap-1">
            {isAuthenticated ? (
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${iconTone} ${
                  transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
                }`}
              >
                <AccountIcon size={18} />
                <span className="max-w-[5.5rem] truncate">
                  {userName?.split(" ")[0] || "Account"}
                </span>
              </button>
            ) : (
              <Link
                href="/login"
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${iconTone} ${
                  transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
                }`}
              >
                <AccountIcon size={18} />
                <span>Account</span>
              </Link>
            )}

            <button
              onClick={() => setDrawerOpen(true)}
              className={`relative inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${iconTone} ${
                transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
              }`}
              aria-label={`Cart, ${cartCount} items`}
            >
              <CartIcon size={18} />
              <span>Cart</span>
              {cartCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-0.5 right-0 bg-brand-red text-white text-[10px] font-bold h-4 min-w-4 px-0.5 flex items-center justify-center rounded-full"
                >
                  {cartCount}
                </motion.span>
              )}
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
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[98]"
              style={{ top: NAVBAR_HEIGHT }}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed left-0 bottom-0 w-[280px] bg-white z-[99] flex flex-col shadow-2xl"
              style={{ top: NAVBAR_HEIGHT }}
            >
              <div className="p-5 bg-gradient-to-br from-gray-900 to-black text-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                    <AccountIcon size={22} className="text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">
                      {isAuthenticated ? userName?.split(" ")[0] || "User" : "Guest User"}
                    </p>
                    <p className="text-xs text-white/60">
                      {isAuthenticated ? userInfo?.email || userInfo?.phone : "Sign in to your account"}
                    </p>
                  </div>
                </div>
                {!isAuthenticated && (
                  <Link
                    href="/login"
                    onClick={closeMenu}
                    className="block mt-4 text-center py-2 bg-white/10 rounded-lg text-xs font-medium hover:bg-white/20 transition-colors"
                  >
                    Sign In
                  </Link>
                )}
              </div>

              <nav className="flex-1 py-3 overflow-y-auto">
                <Link
                  href="/"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <StoreIcon size={18} />
                  <span className="text-sm">Home</span>
                </Link>

                <Link
                  href="/all-products"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <BagIcon size={18} />
                  <span className="text-sm">All Products</span>
                </Link>

                {isAuthenticated ? (
                  <>
                    <Link
                      href="/profile?tab=orders"
                      onClick={closeMenu}
                      className="flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <OrdersIcon size={18} />
                      <span className="text-sm">My Orders</span>
                    </Link>

                    <Link
                      href="/profile?tab=profile"
                      onClick={closeMenu}
                      className="flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <AccountIcon size={18} />
                      <span className="text-sm">Profile</span>
                    </Link>

                    <Link
                      href="/profile?tab=addresses"
                      onClick={closeMenu}
                      className="flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <LocationIcon size={18} />
                      <span className="text-sm">Addresses</span>
                    </Link>

                    <Link
                      href="/wishlist"
                      onClick={closeMenu}
                      className="flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <HeartBagIcon size={18} />
                      <span className="text-sm">Wishlist</span>
                    </Link>

                    <div className="border-t border-gray-100 my-2 mx-5" />

                    <button
                      onClick={() => {
                        logout();
                        closeMenu();
                      }}
                      className="w-full flex items-center gap-3 px-5 py-3 text-brand-red hover:bg-red-50 transition-colors text-left"
                    >
                      <LogOutIcon size={18} />
                      <span className="text-sm">Sign Out</span>
                    </button>
                  </>
                ) : null}
              </nav>

              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <p className="text-[12px] text-gray-400 text-center">
                  © 2026 Urban Aana. All rights reserved.
                </p>
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
