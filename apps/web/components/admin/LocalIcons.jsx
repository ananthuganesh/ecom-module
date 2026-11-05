"use client";

// Admin sidebar / settings icons — Hugeicons. Stroke is a touch heavier when `active`.
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Analytics01Icon,
  ArrowTurnBackwardIcon,
  BotIcon,
  CreditCardIcon,
  DeliveryTruck01Icon,
  Film02Icon,
  Folder01Icon,
  Home01Icon,
  MailSend01Icon,
  Notification01Icon,
  PaintBoardIcon,
  PolicyIcon,
  ReturnRequestIcon,
  SeoIcon,
  Settings01Icon,
  ShoppingBag01Icon,
  Store01Icon,
  Tag01Icon,
  TicketPercentIcon,
  UserGroupIcon,
  UserSettings01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";

function navIcon(icon, name) {
  const Icon = ({ active, ...props }) => (
    <HugeiconsIcon icon={icon} strokeWidth={active ? 2 : 1.5} aria-hidden {...props} />
  );
  Icon.displayName = name;
  return Icon;
}

/** Home */
export const LayoutDashboard = navIcon(Home01Icon, "LayoutDashboard");
/** Orders */
export const ShoppingBag = navIcon(ShoppingBag01Icon, "ShoppingBag");
/** Products */
export const Package = navIcon(Tag01Icon, "Package");
/** Customers */
export const Users = navIcon(UserGroupIcon, "Users");
/** Discounts */
export const TicketPercent = navIcon(TicketPercentIcon, "TicketPercent");
/** Reels */
export const Film = navIcon(Film02Icon, "Film");
/** Media */
export const Folder = navIcon(Folder01Icon, "Folder");
/** Analytics */
export const BarChart3 = navIcon(Analytics01Icon, "BarChart3");
/** Shipment */
export const Truck = navIcon(DeliveryTruck01Icon, "Truck");
/** Returns */
export const ReturnRequest = navIcon(ReturnRequestIcon, "ReturnRequest");
export const ReturnArrow = navIcon(ArrowTurnBackwardIcon, "ReturnArrow");
/** Settings */
export const Settings = navIcon(Settings01Icon, "Settings");
/** Store theme */
export const Sparkles = navIcon(PaintBoardIcon, "Sparkles");

/** Settings sub-navigation */
export const SettingsStore = navIcon(Store01Icon, "SettingsStore");
export const SettingsUsers = navIcon(UserSettings01Icon, "SettingsUsers");
export const SettingsBell = navIcon(Notification01Icon, "SettingsBell");
export const SettingsPolicies = navIcon(PolicyIcon, "SettingsPolicies");
export const SettingsAiAgent = navIcon(BotIcon, "SettingsAiAgent");
export const SettingsPayment = navIcon(CreditCardIcon, "SettingsPayment");
export const SettingsEmailApi = navIcon(MailSend01Icon, "SettingsEmailApi");
export const SettingsSeoMarketing = navIcon(SeoIcon, "SettingsSeoMarketing");
export const SettingsWhatsapp = navIcon(WhatsappIcon, "SettingsWhatsapp");
