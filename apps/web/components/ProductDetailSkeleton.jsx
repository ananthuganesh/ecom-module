"use client";

import { motion } from "framer-motion";

export default function ProductDetailSkeleton() {
    return (
        <div className="container mx-auto w-full px-2 md:px-4 lg:px-8 animate-pulse">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
                {/* Left: Image Skeleton */}
                <div className="space-y-3">
                    <div className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                    </div>
                    {/* Thumbnails Skeleton */}
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="w-14 h-14 rounded bg-gray-50" />
                        ))}
                    </div>
                </div>

                {/* Right: Details Skeleton */}
                <div className="flex flex-col space-y-6">
                    <div className="space-y-2">
                        <div className="w-20 h-3 bg-gray-100 uppercase tracking-widest" />
                        <div className="w-3/4 h-8 bg-gray-100" />
                        <div className="w-1/3 h-4 bg-gray-50" />
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="w-24 h-8 bg-gray-100 rounded" />
                        <div className="w-16 h-6 bg-gray-50 rounded" />
                    </div>

                    <div className="space-y-2">
                        <div className="w-full h-3 bg-gray-100" />
                        <div className="w-full h-3 bg-gray-100" />
                        <div className="w-2/3 h-3 bg-gray-100" />
                    </div>

                    <div className="space-y-4 pt-6 border-t border-gray-100">
                        <div className="w-full h-10 bg-gray-100 rounded" />
                        <div className="flex gap-2">
                            <div className="w-full h-10 bg-gray-100 rounded" />
                            <div className="w-10 h-10 bg-gray-100 rounded" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
