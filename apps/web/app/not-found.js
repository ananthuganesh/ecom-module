"use client";

import {
  BagIcon,
  StoreIcon
} from "@/components/icons/storeIcons";
import Link from "next/link";
import { motion } from "framer-motion";

export default function NotFound() {
    return (
        <main className="min-h-screen bg-[#fcfcfc] flex flex-col pt-16 md:pt-20">

            <section className="flex-1 flex items-center justify-center py-20 px-6 relative overflow-hidden">
                {/* Large Background Deco Text */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none z-0">
                    <span className="text-[20rem] md:text-[30rem] font-black font-heading leading-none">404</span>
                </div>

                <div className="container-site max-w-4xl mx-auto text-center relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <p className="type-micro text-accent mb-6 font-bold tracking-[0.4em]">Lost in Modesty</p>
                        
                        <h1 className="text-3xl md:text-6xl font-bold uppercase tracking-tight text-primary mb-8 font-heading">
                            Page Not Found
                        </h1>
                        
                        <div className="w-16 h-[1px] bg-accent mx-auto mb-10" />
                        
                        <p className="max-w-md mx-auto text-sm md:text-base text-gray-500 leading-relaxed mb-12 font-sans italic">
                            &ldquo;True elegance is when the page you seek is as modest as our collection, but unfortunately, this one has vanished.&rdquo;
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link 
                                href="/" 
                                className="btn-primary flex items-center gap-3 px-8 py-4 min-w-[200px]"
                            >
                                <StoreIcon className="w-4 h-4" />
                                <span>Return Home</span>
                            </Link>
                            
                            <Link 
                                href="/all-products" 
                                className="btn-secondary flex items-center gap-3 px-8 py-4 min-w-[200px]"
                            >
                                <BagIcon className="w-4 h-4" />
                                <span>All Products</span>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>
        </main>
    );
}
