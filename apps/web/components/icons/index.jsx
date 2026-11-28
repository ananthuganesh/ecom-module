"use client";

/**
 * Every app icon, drawn with Hugeicons (free stroke set).
 *
 * Exports keep the old lucide-react names so call sites read the same:
 * `import { Check, Loader2 } from "@/components/icons"`. Each accepts the same
 * props as before (className, size, strokeWidth, onClick, aria-*) and forwards a ref.
 * Add a new icon here instead of importing an icon library in a component.
 */

import { forwardRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  AlertCircleIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArchiveIcon,
  ArrowDown02Icon,
  ArrowDownRight01Icon,
  ArrowLeft02Icon,
  ArrowUp02Icon,
  ArrowUpDownIcon,
  ArrowUpRight01Icon,
  BellIcon,
  BellOffIcon,
  BoldIcon,
  CalendarDaysIcon,
  CancelCircleIcon,
  CheckIcon as HugeCheckIcon,
  CheckmarkCircle02Icon,
  ChevronDownIcon as HugeChevronDownIcon,
  ChevronLeftIcon as HugeChevronLeftIcon,
  ChevronRightIcon as HugeChevronRightIcon,
  ChevronUpIcon as HugeChevronUpIcon,
  CircleCheckIcon as HugeCircleCheckIcon,
  CircleDashedIcon,
  CirclePlusIcon,
  Clock01Icon,
  CopyIcon,
  DatabaseIcon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  File01Icon,
  FileTextIcon,
  GiftIcon,
  GripVerticalIcon,
  HeartIcon,
  ImagePlusIcon,
  IndianRupeeIcon,
  InfoIcon as HugeInfoIcon,
  ItalicIcon,
  LayoutThreeColumnIcon,
  ListIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  LockIcon,
  Mail01Icon,
  MapPinIcon,
  MoreHorizontalIcon as HugeMoreHorizontalIcon,
  OctagonXIcon as HugeOctagonXIcon,
  PackageCheckIcon,
  PackageIcon,
  PanelLeftIcon as HugePanelLeftIcon,
  PauseIcon,
  PencilIcon,
  PercentIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  RepeatIcon,
  RotateCcwIcon,
  SaveIcon,
  Search01Icon,
  SearchXIcon,
  SendIcon,
  ShoppingBag01Icon,
  SmartphoneIcon,
  Tag01Icon,
  TextAlignCenterIcon,
  TriangleAlertIcon as HugeTriangleAlertIcon,
  TruckIcon,
  UnderlineIcon,
  UnfoldMoreIcon,
  Upload01Icon,
  UserPlusIcon,
  Wallet01Icon,
  XIcon as HugeXIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";

function make(icon, name) {
  const Icon = forwardRef(function Icon(props, ref) {
    return <HugeiconsIcon ref={ref} icon={icon} aria-hidden={props["aria-label"] ? undefined : true} {...props} />;
  });
  Icon.displayName = name;
  return Icon;
}

export const AlertCircle = make(AlertCircleIcon, "AlertCircle");
export const AlertTriangle = make(Alert02Icon, "AlertTriangle");
export const AlignCenter = make(TextAlignCenterIcon, "AlignCenter");
export const AlignLeft = make(AlignLeftIcon, "AlignLeft");
export const AlignRight = make(AlignRightIcon, "AlignRight");
export const Archive = make(ArchiveIcon, "Archive");
export const ArrowDown = make(ArrowDown02Icon, "ArrowDown");
export const ArrowDownRight = make(ArrowDownRight01Icon, "ArrowDownRight");
export const ArrowLeft = make(ArrowLeft02Icon, "ArrowLeft");
export const ArrowUp = make(ArrowUp02Icon, "ArrowUp");
export const ArrowUpDown = make(ArrowUpDownIcon, "ArrowUpDown");
export const ArrowUpRight = make(ArrowUpRight01Icon, "ArrowUpRight");
export const Bell = make(BellIcon, "Bell");
export const BellOff = make(BellOffIcon, "BellOff");
export const Bold = make(BoldIcon, "Bold");
export const CalendarDays = make(CalendarDaysIcon, "CalendarDays");
export const Check = make(HugeCheckIcon, "Check");
export const CheckCircle2 = make(CheckmarkCircle02Icon, "CheckCircle2");
export const CheckIcon = make(HugeCheckIcon, "CheckIcon");
export const ChevronDown = make(HugeChevronDownIcon, "ChevronDown");
export const ChevronDownIcon = make(HugeChevronDownIcon, "ChevronDownIcon");
export const ChevronLeftIcon = make(HugeChevronLeftIcon, "ChevronLeftIcon");
export const ChevronRight = make(HugeChevronRightIcon, "ChevronRight");
export const ChevronRightIcon = make(HugeChevronRightIcon, "ChevronRightIcon");
export const ChevronUp = make(HugeChevronUpIcon, "ChevronUp");
export const ChevronUpIcon = make(HugeChevronUpIcon, "ChevronUpIcon");
export const ChevronsUpDown = make(UnfoldMoreIcon, "ChevronsUpDown");
export const CircleCheckIcon = make(HugeCircleCheckIcon, "CircleCheckIcon");
export const CircleDashed = make(CircleDashedIcon, "CircleDashed");
export const CirclePlus = make(CirclePlusIcon, "CirclePlus");
export const Clock = make(Clock01Icon, "Clock");
export const Columns3 = make(LayoutThreeColumnIcon, "Columns3");
export const Copy = make(CopyIcon, "Copy");
export const Database = make(DatabaseIcon, "Database");
export const Download = make(Download01Icon, "Download");
export const Edit3 = make(Edit02Icon, "Edit3");
export const ExternalLink = make(ExternalLinkIcon, "ExternalLink");
export const Eye = make(EyeIcon, "Eye");
export const EyeOff = make(EyeOffIcon, "EyeOff");
export const File = make(File01Icon, "File");
export const FileText = make(FileTextIcon, "FileText");
export const Gift = make(GiftIcon, "Gift");
export const GripVertical = make(GripVerticalIcon, "GripVertical");
export const Heart = make(HeartIcon, "Heart");
export const ImagePlus = make(ImagePlusIcon, "ImagePlus");
export const IndianRupee = make(IndianRupeeIcon, "IndianRupee");
export const InfoIcon = make(HugeInfoIcon, "InfoIcon");
export const Italic = make(ItalicIcon, "Italic");
export const List = make(ListIcon, "List");
export const ListOrdered = make(ListOrderedIcon, "ListOrdered");
export const Loader2 = make(LoaderCircleIcon, "Loader2");
export const Loader2Icon = make(LoaderCircleIcon, "Loader2Icon");
export const Lock = make(LockIcon, "Lock");
export const Mail = make(Mail01Icon, "Mail");
export const MapPin = make(MapPinIcon, "MapPin");
export const MoreHorizontalIcon = make(HugeMoreHorizontalIcon, "MoreHorizontalIcon");
export const OctagonXIcon = make(HugeOctagonXIcon, "OctagonXIcon");
export const Package = make(PackageIcon, "Package");
export const PackageCheck = make(PackageCheckIcon, "PackageCheck");
export const PanelLeftIcon = make(HugePanelLeftIcon, "PanelLeftIcon");
export const Pause = make(PauseIcon, "Pause");
export const Pencil = make(PencilIcon, "Pencil");
export const Percent = make(PercentIcon, "Percent");
export const Phone = make(PhoneIcon, "Phone");
export const Play = make(PlayIcon, "Play");
export const Plus = make(PlusIcon, "Plus");
export const Printer = make(PrinterIcon, "Printer");
export const RefreshCw = make(RefreshCwIcon, "RefreshCw");
export const Repeat = make(RepeatIcon, "Repeat");
export const RotateCcw = make(RotateCcwIcon, "RotateCcw");
export const Save = make(SaveIcon, "Save");
export const Search = make(Search01Icon, "Search");
export const SearchIcon = make(Search01Icon, "SearchIcon");
export const SearchX = make(SearchXIcon, "SearchX");
export const Send = make(SendIcon, "Send");
export const ShoppingBag = make(ShoppingBag01Icon, "ShoppingBag");
export const Smartphone = make(SmartphoneIcon, "Smartphone");
export const Tag = make(Tag01Icon, "Tag");
export const Trash2 = make(Delete02Icon, "Trash2");
export const TriangleAlertIcon = make(HugeTriangleAlertIcon, "TriangleAlertIcon");
export const Truck = make(TruckIcon, "Truck");
export const Underline = make(UnderlineIcon, "Underline");
export const Upload = make(Upload01Icon, "Upload");
export const UserPlus = make(UserPlusIcon, "UserPlus");
export const Wallet = make(Wallet01Icon, "Wallet");
export const X = make(HugeXIcon, "X");
export const XCircle = make(CancelCircleIcon, "XCircle");
export const XIcon = make(HugeXIcon, "XIcon");
export const Zap = make(ZapIcon, "Zap");
