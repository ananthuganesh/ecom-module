"use client";

import { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { orderService } from "@/api";
import { Loader2 } from "lucide-react";

export default function StripePayment({ orderId, amount, onSuccess }) {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Return URL matches the current order page
                return_url: `${window.location.origin}/order/${orderId}?payment_success=true`,
            },
            redirect: "if_required",
        });

        if (error) {
            setMessage(error.message);
        } else if (paymentIntent && paymentIntent.status === "succeeded") {
            try {
                await orderService.updateToPaid(orderId, {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    update_time: new Date().toISOString(),
                });
                onSuccess();
            } catch (err) {
                console.error("Error updating order status:", err);
                setMessage("Payment succeeded, but failed to update order status. Please contact support.");
            }
        }

        setIsLoading(false);
    };

    return (
        <form id="payment-form" onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement id="payment-element" options={{ layout: "tabs" }} />
            <button
                disabled={isLoading || !stripe || !elements}
                id="submit"
                className="btn-primary w-full h-14 flex items-center justify-center space-x-2"
            >
                {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <span>Pay Now (₹{amount.toFixed(2)})</span>
                )}
            </button>
            {message && <div id="payment-message" className="text-red-500 text-[10px] font-bold uppercase tracking-widest text-center mt-4">{message}</div>}
        </form>
    );
}
