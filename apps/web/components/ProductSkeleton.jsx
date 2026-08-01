"use client";

import { motion } from "framer-motion";

export default function ProductSkeleton() {
    return (
        <div className="group relative">
            <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 animate-pulse">
                {/* Shimmer effect overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
            </div>

            <div className="mt-2 text-center px-1 flex flex-col items-center">
                {/* Brand name skeleton */}
                <div className="w-16 h-2 bg-gray-100 mb-1.5 animate-pulse" />
                {/* Product name skeleton */}
                <div className="w-24 h-3 bg-gray-100 mb-1 animate-pulse" />
                {/* Price skeleton */}
                <div className="w-20 h-3 bg-gray-50 mt-0.5 animate-pulse" />
            </div>
        </div>
    );
}

// Add these styles to your global CSS if not present for shimmer
// @keyframes shimmer {
//   100% { transform: translateX(100%); }
// }
