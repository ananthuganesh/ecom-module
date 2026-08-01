"use client";

import { Camera, Mail, Phone } from "lucide-react";
import {
  AccountIcon,
  ChevronRightIcon,
  InfoIcon
} from "@/components/icons/storeIcons";
import { useState } from "react";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { motion } from "framer-motion";

export default function SettingsPage() {
    const { userInfo, setUserInfo } = useAuthStore();
    const [updating, setUpdating] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [profileForm, setProfileForm] = useState({
        name: userInfo?.name || "",
        email: userInfo?.email || "",
        phone: userInfo?.phone || ""
    });

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setUpdating(true);
        setMessage({ type: "", text: "" });
        try {
            const data = await authService.updateProfile({
                name: profileForm.name,
                email: profileForm.email,
                phone: profileForm.phone
            });
            setUserInfo(data);
            setMessage({ type: "success", text: "Profile details updated successfully." });
        } catch (error) {
            setMessage({ type: "error", text: error.response?.data?.message || "Error updating profile" });
        } finally {
            setUpdating(false);
        }
    };

    return (
        <DashboardLayout title="Account Settings">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Profile Picture Section */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-8 border border-gray-100 shadow-sm text-center flex flex-col items-center">
                        <div className="relative group mb-6">
                            <div className="w-32 h-32 bg-primary/5 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-50 group-hover:border-accent transition-all">
                                <AccountIcon className="w-16 h-16 text-primary/20" />
                            </div>
                            <button className="absolute bottom-1 right-1 bg-accent text-white p-2.5 rounded-full shadow-lg hover:scale-110 transition-transform">
                                <Camera className="w-4 h-4" />
                            </button>
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-1">{userInfo?.name}</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-8">{userInfo?.email}</p>
                        
                        <div className="w-full pt-8 border-t border-gray-50 text-left space-y-4">
                            <div className="flex items-center space-x-3 text-gray-400">
                                <Mail className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">{userInfo?.email}</span>
                            </div>
                            <div className="flex items-center space-x-3 text-gray-400">
                                <Phone className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">{userInfo?.phone || "No phone added"}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form Section */}
                <div className="lg:col-span-2">
                    <div className="bg-white p-8 md:p-12 border border-gray-100 shadow-sm">
                        <form onSubmit={handleUpdateProfile} className="space-y-8">
                            {message.text && (
                                <motion.div 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`p-4 text-[10px] font-black uppercase tracking-widest border border-l-4 ${
                                        message.type === "success" 
                                            ? "bg-emerald-50 text-emerald-600 border-emerald-100 border-l-emerald-500" 
                                            : "bg-red-50 text-brand-red border-red-100 border-l-red-500"
                                    }`}
                                >
                                    {message.text}
                                </motion.div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary block">Full Name</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-100 p-4 text-sm focus:outline-none focus:border-accent transition-colors bg-gray-50/30"
                                        value={profileForm.name}
                                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary block">Email Address</label>
                                    <input
                                        type="email"
                                        className="w-full border border-gray-100 p-4 text-sm focus:outline-none focus:border-accent transition-colors bg-gray-50/30"
                                        value={profileForm.email}
                                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-3 md:col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary block">Phone Number</label>
                                    <input
                                        type="tel"
                                        className="w-full border border-gray-100 p-4 text-sm focus:outline-none focus:border-accent transition-colors bg-gray-50/30"
                                        value={profileForm.phone}
                                        placeholder="+91 00000 00000"
                                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={updating}
                                className="btn-primary w-full md:w-auto px-12 py-4 text-[10px] uppercase font-black tracking-[0.3em] flex items-center justify-center space-x-3 group"
                            >
                                {updating ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <span>Save Changes</span>
                                        <ChevronRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-12 p-6 bg-secondary/30 flex items-start space-x-4 border-l-2 border-gray-200">
                            <InfoIcon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-gray-500 leading-relaxed font-bold uppercase tracking-widest">
                                Changing your email address will require you to log in again with the new credentials.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
