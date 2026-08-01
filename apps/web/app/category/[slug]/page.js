"use client";

import { Loader2 } from "lucide-react";
import {
  ChevronRightIcon
} from "@/components/icons/storeIcons";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import ProductCard from "@/components/storefront/ProductCard";
import { collectionService } from "@/api";
import { motion, AnimatePresence } from "framer-motion";

import Link from "next/link";

export default function CategoryPage() {
    const { slug } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCategoryData = async () => {
            setLoading(true);
            try {
                const response = await collectionService.getByCategory(slug);
                setData(response);
            } catch (err) {
                console.error("Error fetching category collections:", err);
                setError(err.message || "Failed to load category data");
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchCategoryData();
        }
    }, [slug]);

    if (loading) {
        return (
            <main className="min-h-screen bg-white">
                <div className="flex flex-col items-center justify-center h-[70vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                    <p className="text-[12px] font-black uppercase tracking-[0.3em] text-gray-400">Loading Collections</p>
                </div>
            </main>
        );
    }

    if (error || !data) {
        return (
            <main className="min-h-screen bg-white">
                <div className="container-site pt-40 pb-20 text-center">
                    <h1 className="text-4xl font-bold uppercase mb-4 tracking-tighter">Category Not Found</h1>
                    <p className="text-gray-500 mb-8 font-medium">We couldn&apos;t find the category you&apos;re looking for.</p>
                    <Link href="/" className="btn-primary">Return Home</Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white">

            {/* Category Hero */}
            <section className="relative overflow-hidden border-b-2 border-black bg-[#F9F9F5] pb-16 pt-28 md:pb-24 md:pt-36">
                <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-[0.035]">
                     <span className="font-vina text-[20vw] uppercase leading-none select-none">
                        {data.category.name}
                     </span>
                </div>
                <div className="container-site relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="max-w-3xl"
                    >
                        <div className="flex items-center gap-2 mb-6">
                            <Link href="/" className="text-[12px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-[#DF1721]">Home</Link>
                            <ChevronRightIcon className="w-3 h-3 text-gray-300" />
                            <span className="text-[12px] font-bold uppercase tracking-widest text-[#DF1721]">{data.category.name}</span>
                        </div>
                        <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">Urban Aana archive</p>
                        <h1 className="font-vina text-6xl uppercase tracking-tight mb-8 leading-[0.9] md:text-8xl">
                            {data.category.name}
                        </h1>
                        <p className="text-sm md:text-base text-gray-600 max-w-xl leading-relaxed font-medium">
                            {data.category.description || `Explore our exclusive collection of premium ${data.category.name.toLowerCase()}, designed for the modern lifestyle.`}
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Collections List */}
            <section className="bg-white py-16 md:py-24">
                <div className="container-site">
                    <AnimatePresence mode="wait">
                        {data.collections.length > 0 ? (
                            <div className="space-y-20 md:space-y-28">
                                {data.collections.map((collection, idx) => (
                                    <motion.div
                                        key={collection._id}
                                        initial={{ opacity: 0, y: 40 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-100px" }}
                                        transition={{ duration: 0.8, delay: idx * 0.1 }}
                                        className="relative"
                                    >
                                        {/* Collection Header */}
                                        <div className="mb-10 flex flex-col gap-6 border-b-2 border-black pb-6 md:flex-row md:items-end md:justify-between">
                                            <div className="max-w-2xl">
                                                <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.4em] text-[#DF1721]">Collection {idx + 1}</p>
                                                <h2 className="font-vina text-4xl uppercase tracking-tight md:text-6xl">{collection.title}</h2>
                                                <p className="text-gray-500 text-sm md:text-base leading-relaxed max-w-lg font-medium">
                                                    {collection.summary}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-[12px] font-black uppercase tracking-widest text-gray-300">
                                                    {collection.products.length} Products
                                                </span>
                                            </div>
                                        </div>

                                        {/* Products Grid */}
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-12 md:gap-x-8 md:gap-y-20">
                                            {collection.products.map((product) => (
                                                <ProductCard key={product._id} product={product} />
                                            ))}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-20 text-center">
                                <p className="text-[12px] font-black uppercase tracking-[0.3em] text-gray-300 italic">
                                    No collections found in this category yet.
                                </p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </section>
        </main>
    );
}
