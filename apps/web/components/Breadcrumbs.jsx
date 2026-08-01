"use client";

import {
  ChevronRightIcon,
  StoreIcon
} from "@/components/icons/storeIcons";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Breadcrumbs({ customItems = [] }) {
    const pathname = usePathname();
    
    // Split pathname into segments
    const pathSegments = pathname.split("/").filter(segment => segment !== "");
    
    // Generate default breadcrumbs from path
    const defaultBreadcrumbs = pathSegments.map((segment, index) => {
        const href = "/" + pathSegments.slice(0, index + 1).join("/");
        const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
        return { label, href };
    });

    const items = customItems.length > 0 ? customItems : defaultBreadcrumbs;

    if (pathname === "/") return null;

    return (
        <nav className="hidden md:flex items-center space-x-2 py-4 text-[10px] uppercase tracking-widest font-black text-gray-400 no-print">
            <Link href="/" className="hover:text-primary transition-colors flex items-center">
                <StoreIcon className="w-3 h-3 mr-1" />
                <span>Home</span>
            </Link>
            
            {items.map((item, index) => (
                <div key={index} className="flex items-center space-x-2">
                    <ChevronRightIcon className="w-3 h-3 text-gray-300" />
                    <Link 
                        href={item.href} 
                        className={`hover:text-primary transition-colors ${index === items.length - 1 ? 'text-primary' : ''}`}
                    >
                        {item.label}
                    </Link>
                </div>
            ))}
        </nav>
    );
}
