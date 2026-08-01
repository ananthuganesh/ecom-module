"use client";

import React from "react";
import Image from "next/image";

export default function Invoice({ order }) {
    if (!order) return null;

    const items = order.orderItems || order.items || [];
    const shipping = order.shippingAddress || {};
    const totalPrice = order.totalPrice || order.finalPrice || 0;
    const shippingPrice = order.shippingPrice || order.deliveryAmount || 0;
    const taxPrice = order.taxPrice || 0;
    const giftFee = order.isGift ? (order.giftFee || 39) : 0;
    const subtotal = totalPrice - shippingPrice - taxPrice - giftFee;

    return (
        <div className="invoice-container p-6 bg-white text-black font-sans leading-tight max-w-[800px] mx-auto hidden print:block">
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                <div>
                    <Image src="/images/invoice/logo-light.png" alt="Urban Aana" width={130} height={59} className="h-10 w-auto object-contain mb-1" />
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Premium Fashion Store</p>
                </div>
                <div className="text-right">
                    <h2 className="text-lg font-black uppercase mb-0.5">INVOICE</h2>
                    <p className="text-[9px] uppercase tracking-widest font-bold">#ORD-{order._id?.slice(-8).toUpperCase()}</p>
                    <p className="text-[9px] uppercase tracking-widest font-bold mt-0.5 text-gray-400">Date: {new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
            </div>

            {/* Billing/Shipping Info */}
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-[9px] uppercase tracking-widest font-black mb-3 border-b border-gray-100 pb-1">Sold By</h3>
                    <p className="text-xs font-bold uppercase">Urban Aana</p>
                    <p className="text-[10px] text-gray-600">4/985, Riz Tower, Sreekaryam, Pangappara</p>
                    <p className="text-[10px] text-gray-600">Thiruvananthapuram, Kerala - 695581</p>
                    <p className="text-[10px] text-gray-600 font-bold mt-1">Ph: 9037381610</p>
                </div>
                <div>
                    <h3 className="text-[9px] uppercase tracking-widest font-black mb-3 border-b border-gray-100 pb-1">Ship To</h3>
                    <p className="text-xs font-bold uppercase">{order.user?.name || "Customer"}</p>
                    <p className="text-[10px] text-gray-600">{shipping.address}</p>
                    <p className="text-[10px] text-gray-600">{shipping.city}, {shipping.postalCode}</p>
                    <p className="text-[10px] text-gray-600">{shipping.country}</p>
                    {order.user?.phone && <p className="text-[10px] text-gray-600 mt-1 font-bold">Ph: {order.user.phone}</p>}
                </div>
            </div>

            {order.isGift && order.giftMessage && (
                <div className="mb-8 border border-gray-100 p-4 bg-gray-50">
                    <h3 className="text-[9px] uppercase tracking-widest font-black mb-2 border-b border-gray-200 pb-1">Gift Message</h3>
                    <p className="text-xs font-serif italic text-gray-800">"{order.giftMessage}"</p>
                </div>
            )}

            {/* table */}
            <table className="w-full mb-8 border-collapse">
                <thead>
                    <tr className="border-b-2 border-black">
                        <th className="text-left text-[9px] uppercase tracking-widest font-black py-2">Item Description</th>
                        <th className="text-center text-[9px] uppercase tracking-widest font-black py-2">Price</th>
                        <th className="text-center text-[9px] uppercase tracking-widest font-black py-2">Qty</th>
                        <th className="text-right text-[9px] uppercase tracking-widest font-black py-2">Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                        <tr key={idx}>
                            <td className="py-3">
                                <p className="text-xs font-bold uppercase">{item.name}</p>
                                <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5">
                                    {item.size ? `Size: ${item.size}` : ""} {item.color ? `· Color: ${item.color}` : ""}
                                </p>
                            </td>
                            <td className="text-center text-xs font-medium">₹{item.price?.toFixed(2)}</td>
                            <td className="text-center text-xs font-medium">{item.qty}</td>
                            <td className="text-right text-xs font-black">₹{(item.price * item.qty).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Calculations */}
            <div className="flex justify-end">
                <div className="w-56 space-y-2 pt-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-gray-400">Subtotal</span>
                        <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-gray-400">Shipping</span>
                        <span>₹{shippingPrice.toFixed(2)}</span>
                    </div>
                    {taxPrice > 0 && (
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                            <span className="text-gray-400">Tax</span>
                            <span>₹{taxPrice.toFixed(2)}</span>
                        </div>
                    )}
                    {order.isGift && (
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                            <span className="text-gray-400">Gift Wrap</span>
                            <span>₹{giftFee.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-base font-black uppercase tracking-tight border-t-2 border-black pt-2">
                        <span>Total</span>
                        <span>₹{totalPrice.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-gray-100 flex flex-col items-end">
                <Image
                    src="/images/invoice/authorized-signature.png"
                    alt="Authorized signature"
                    width={200}
                    height={72}
                    className="h-[72px] w-auto object-contain mb-1"
                />
                <p className="min-w-[180px] text-center text-[9px] uppercase tracking-widest font-[550] text-gray-500">
                    Authorized Signature
                </p>
                <p className="w-full text-center text-[9px] uppercase tracking-widest font-black text-gray-400 mt-8 mb-1">
                    Thank you for shopping with Urban Aana
                </p>
            </div>

            <style jsx>{`
                @media print {
                    .invoice-container {
                        display: block !important;
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 40px !important;
                    }
                }
            `}</style>
        </div>
    );
}
