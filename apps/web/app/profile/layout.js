"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function ProfileLayout({ children }) {
    const { userInfo } = useAuthStore();
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        console.log("ProfileLayout: Checking auth status...", { hasUserInfo: !!userInfo, mounted });
        if (mounted) {
            if (!userInfo) {
                console.log("ProfileLayout: No user info, redirecting to login...");
                router.push("/login?redirect=/profile");
            } else {
                console.log("ProfileLayout: User authorized, showing content.");
                setIsChecking(false);
            }
        }
    }, [userInfo, router, mounted]);

    if (isChecking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fcfcfc]">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            </div>
        );
    }

    return <>{children}</>;
}
