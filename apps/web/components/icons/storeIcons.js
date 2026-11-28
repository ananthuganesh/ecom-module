"use client";

/** Storefront icon set — Hugeicons (free stroke set). Names are kept for existing call sites. */
import { createElement } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  CheckmarkBadge01Icon,
  Delete02Icon,
  DeliveryBox01Icon,
  DeliveryTruck01Icon,
  FilterHorizontalIcon,
  InformationCircleIcon,
  LinkSquare02Icon,
  Logout01Icon,
  LoyaltyCardIcon,
  Menu01Icon,
  MinusSignIcon,
  PackageIcon as HugePackageIcon,
  PlusSignIcon,
  ReturnRequestIcon,
  RulerIcon as HugeRulerIcon,
  Search01Icon,
  ShoppingBag01Icon,
  ShoppingBagFavoriteIcon,
  ShoppingBasketSecure01Icon,
  ShoppingCart01Icon,
  ShoppingCartAdd01Icon,
  Store01Icon,
  StoreLocation01Icon,
  TagsIcon,
  Tick02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";

/** 18px by default, like the old mask icons; `size` or a `size-*` class overrides it. */
function storeIcon(icon, name) {
  function Icon({ className, size, active: _active, ...props }) {
    return createElement(HugeiconsIcon, {
      icon,
      size: size ?? 18,
      className: className ?? (size == null ? "size-[18px] shrink-0" : "shrink-0"),
      "aria-hidden": true,
      ...props,
    });
  }
  Icon.displayName = name;
  return Icon;
}

export const MenuIcon = storeIcon(Menu01Icon, "MenuIcon");
export const CartIcon = storeIcon(ShoppingCart01Icon, "CartIcon");
export const AccountIcon = storeIcon(UserIcon, "AccountIcon");
export const StoreIcon = storeIcon(Store01Icon, "StoreIcon");
export const BagIcon = storeIcon(ShoppingBag01Icon, "BagIcon");
export const PackageIcon = storeIcon(HugePackageIcon, "PackageIcon");
export const OrdersIcon = storeIcon(DeliveryBox01Icon, "OrdersIcon");
export const TruckIcon = storeIcon(DeliveryTruck01Icon, "TruckIcon");
export const PlusIcon = storeIcon(PlusSignIcon, "PlusIcon");
export const MinusIcon = storeIcon(MinusSignIcon, "MinusIcon");
export const CloseIcon = storeIcon(Cancel01Icon, "CloseIcon");
export const DeleteIcon = storeIcon(Delete02Icon, "DeleteIcon");
export const FilterIcon = storeIcon(FilterHorizontalIcon, "FilterIcon");
export const SearchIcon = storeIcon(Search01Icon, "SearchIcon");
export const ChevronLeftIcon = storeIcon(ArrowLeft01Icon, "ChevronLeftIcon");
export const ChevronRightIcon = storeIcon(ArrowRight01Icon, "ChevronRightIcon");
export const CaretIcon = storeIcon(ArrowDown01Icon, "CaretIcon");
export const ArrowIcon = storeIcon(ArrowRight02Icon, "ArrowIcon");
export const HeartBagIcon = storeIcon(ShoppingBagFavoriteIcon, "HeartBagIcon");
export const AddToCartIcon = storeIcon(ShoppingCartAdd01Icon, "AddToCartIcon");
export const CheckIcon = storeIcon(Tick02Icon, "CheckIcon");
export const CheckBurstIcon = storeIcon(CheckmarkBadge01Icon, "CheckBurstIcon");
export const WarningIcon = storeIcon(Alert02Icon, "WarningIcon");
export const InfoIcon = storeIcon(InformationCircleIcon, "InfoIcon");
export const ExternalIcon = storeIcon(LinkSquare02Icon, "ExternalIcon");
export const LocationIcon = storeIcon(StoreLocation01Icon, "LocationIcon");
export const LogOutIcon = storeIcon(Logout01Icon, "LogOutIcon");
export const CardIcon = storeIcon(LoyaltyCardIcon, "CardIcon");
export const TagIcon = storeIcon(TagsIcon, "TagIcon");
export const AvailableIcon = storeIcon(Tick02Icon, "AvailableIcon");
export const RulerIcon = storeIcon(HugeRulerIcon, "RulerIcon");
export const ReturnIcon = storeIcon(ReturnRequestIcon, "ReturnIcon");
export const SecureIcon = storeIcon(ShoppingBasketSecure01Icon, "SecureIcon");
export const ErrorIcon = storeIcon(AlertCircleIcon, "ErrorIcon");
