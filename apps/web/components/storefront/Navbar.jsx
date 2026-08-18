"use client";

import {
  AccountIcon,
  CartIcon,
  CloseIcon,
  MenuIcon,
  SearchIcon,
} from "@/components/icons/storeIcons";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { productService } from "@/api";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useWishlistStore } from "@/store/useWishlistStore";
import SafeImage from "@/components/SafeImage";
import { resolveImageUrl } from "@/utils/imageResolver";
import { formatINR } from "@/utils/formatINR";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";

const CartDrawer = dynamic(() => import("./CartDrawer"), { ssr: false });

const NAVBAR_HEIGHT = 56;

const MENU_LINKS = [
  { href: "/all-products", label: "All Products" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];

function DrawerAccountCard({ onClose }) {
  const userInfo = useAuthStore((s) => s.userInfo);
  const logout = useAuthStore((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);
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

  const handleConfirmLogout = () => {
    setConfirmLogout(false);
    logout();
    onClose();
  };

  if (isAuthenticated) {
    return (
      <>
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
              onClick={() => setConfirmLogout(true)}
              className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-[#DF1721] transition-colors hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>

        <AnimatePresence>
          {confirmLogout ? (
            <>
              <motion.div
                key="logout-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
                onClick={() => setConfirmLogout(false)}
              />
              <motion.div
                key="logout-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="logout-confirm-title"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                className="fixed top-1/2 left-1/2 z-[210] w-[min(100%-2rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
              >
                <h3
                  id="logout-confirm-title"
                  className="text-[16px] font-semibold text-gray-900"
                >
                  Logout?
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
                  Are you sure you want to log out of your account?
                </p>
                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLogout(false)}
                    className="flex h-10 flex-1 items-center justify-center rounded-md border border-gray-200 bg-white text-[13px] font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmLogout}
                    className="flex h-10 flex-1 items-center justify-center rounded-md bg-[#DF1721] text-[13px] font-semibold text-white transition-colors hover:bg-black"
                  >
                    Yes
                  </button>
                </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </>
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
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [overHero, setOverHero] = useState(isHome);
  const searchInputRef = useRef(null);
  const suggestGen = useRef(0);

  const closeMenu = () => setIsMobileMenuOpen(false);
  const closeSearch = () => {
    setIsSearchOpen(false);
    setSuggestions([]);
    setSuggestLoading(false);
  };

  const openSearch = () => {
    closeMenu();
    setSearchQuery(searchParams.get("search") || "");
    setSuggestions([]);
    setIsSearchOpen(true);
  };

  const submitSearch = (e) => {
    e?.preventDefault?.();
    const q = searchQuery.trim();
    closeSearch();
    if (q) {
      router.push(`/all-products?search=${encodeURIComponent(q)}`);
    } else {
      router.push("/all-products");
    }
  };

  useEffect(() => {
    document.body.style.overflow =
      isMobileMenuOpen || isSearchOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen, isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen && !isSearchOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (isSearchOpen) closeSearch();
      else closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileMenuOpen, isSearchOpen]);

  // Live product suggestions while typing.
  useEffect(() => {
    if (!isSearchOpen) return;
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    const gen = ++suggestGen.current;
    setSuggestLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const data = await productService.getSuggestions(q);
        if (gen !== suggestGen.current) return;
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (gen !== suggestGen.current) return;
        setSuggestions([]);
      } finally {
        if (gen === suggestGen.current) setSuggestLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [searchQuery, isSearchOpen]);

  useEffect(() => {
    closeSearch();
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    if (!isHome) {
      setOverHero(false);
      return;
    }

    const update = () => {
      const hero = document.querySelector("[data-home-hero]");
      if (!hero) {
        setOverHero((prev) => (prev === false ? prev : false));
        return;
      }
      const { bottom } = hero.getBoundingClientRect();
      const next = bottom > NAVBAR_HEIGHT;
      setOverHero((prev) => (prev === next ? prev : next));
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isHome]);

  const transparent = isHome && overHero && !isSearchOpen;
  const iconTone = transparent ? "text-white" : "text-gray-900";
  const navBtnClass = `inline-flex items-center gap-1.5 rounded-lg p-2 text-[12px] font-medium transition-colors md:px-2 md:py-1.5 ${iconTone} ${
    transparent ? "hover:bg-white/10" : "hover:bg-gray-50"
  }`;

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
          <div className="flex items-center justify-start gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={navBtnClass}
              aria-label="Menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="storefront-menu"
            >
              <MenuIcon size={18} />
              <span className="hidden md:inline">Menu</span>
            </button>
            <button
              type="button"
              onClick={openSearch}
              className={navBtnClass}
              aria-label="Search"
              aria-expanded={isSearchOpen}
              aria-controls="navbar-search-suggestions"
            >
              <SearchIcon size={18} />
              <span className="hidden md:inline">Search</span>
            </button>
          </div>

          <div className="flex items-center justify-center">
            <Link href="/" onClick={closeMenu} className="flex items-center" aria-label="Urban Aana home">
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
              <Link
                href="/account"
                className={navBtnClass}
                aria-label={userName?.split(" ")[0] || "Account"}
              >
                <AccountIcon size={18} />
                <span className="hidden max-w-[5.5rem] truncate md:inline">
                  {userName?.split(" ")[0] || "Account"}
                </span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className={navBtnClass}
                aria-label="Account"
              >
                <AccountIcon size={18} />
                <span className="hidden md:inline">Account</span>
              </button>
            )}

            <Link
              href="/wishlist"
              className={navBtnClass}
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
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={navBtnClass}
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
        {isSearchOpen ? (
          <>
            <motion.div
              key="search-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeSearch}
              className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              key="search-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Search products"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed top-0 right-0 left-0 z-[160] border-b border-gray-200 bg-white shadow-lg"
            >
              <form
                onSubmit={submitSearch}
                className="mx-auto flex h-14 w-full items-center gap-2 px-4 lg:px-8"
              >
                <SearchIcon size={18} className="shrink-0 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products"
                  className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  autoComplete="off"
                  enterKeyHint="search"
                  aria-autocomplete="list"
                  aria-controls="navbar-search-suggestions"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
                  aria-label="Close search"
                >
                  <CloseIcon size={20} />
                </button>
              </form>

              <div
                id="navbar-search-suggestions"
                className={`max-h-[min(70vh,28rem)] overflow-y-auto ${
                  searchQuery.trim() ? "border-t border-gray-100" : ""
                }`}
              >
                {searchQuery.trim() ? (
                  <div className="mx-auto w-full px-2 py-2 lg:px-6">
                    {suggestLoading && suggestions.length === 0 ? (
                      <p className="px-3 py-3 text-[13px] text-gray-500">
                        Searching…
                      </p>
                    ) : null}
                    {suggestions.length > 0 ? (
                      <ul className="py-1">
                        {suggestions.map((item) => {
                          const href = `/product/${item.slug || item._id}`;
                          const thumb = item.thumbnails?.[0];
                          return (
                            <li key={item._id || href}>
                              <Link
                                href={href}
                                onClick={closeSearch}
                                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50"
                              >
                                <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100">
                                  {thumb ? (
                                    <SafeImage
                                      src={resolveImageUrl(thumb)}
                                      alt={item.productName || "Product"}
                                      fill
                                      sizes="40px"
                                      className="object-cover"
                                    />
                                  ) : null}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14px] font-medium text-gray-900">
                                    {item.productName}
                                  </span>
                                  {item.price != null ? (
                                    <span className="mt-0.5 block text-[12px] text-gray-500">
                                      {formatINR(item.price)}
                                    </span>
                                  ) : null}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : !suggestLoading ? (
                      <p className="px-3 py-3 text-[13px] text-gray-500">
                        No products match “{searchQuery.trim()}”
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={submitSearch}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-gray-900 transition-colors hover:bg-gray-50"
                    >
                      <SearchIcon size={16} className="text-gray-400" />
                      <span>
                        Search all products for “{searchQuery.trim()}”
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileMenuOpen ? (
          <>
            <motion.div
              key="menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={closeMenu}
              className="fixed inset-0 z-[150] bg-black/50"
            />
            <motion.aside
              key="menu-drawer"
              id="storefront-menu"
              role="dialog"
              aria-modal="true"
              aria-labelledby="storefront-menu-title"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 left-0 z-[160] flex h-dvh max-h-dvh w-full max-w-[320px] flex-col overflow-hidden bg-white shadow-2xl will-change-transform"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3.5">
                <h2 id="storefront-menu-title" className="text-lg font-semibold text-gray-900">
                  Menu
                </h2>
                <button
                  type="button"
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
        ) : null}
      </AnimatePresence>

      <CartDrawer />
    </>
  );
};

export default Navbar;
