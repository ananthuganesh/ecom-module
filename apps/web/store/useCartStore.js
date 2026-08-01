import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { trackAddToCart } from '@/lib/tracking';
import { CART_STORAGE_KEY, ensureStorageKey } from '@/lib/storageKeys';

ensureStorageKey(CART_STORAGE_KEY);

export const useCartStore = create(
    persist(
        (set, get) => ({
            cartItems: [],
            shippingAddress: {},
            paymentMethod: 'razorpay',

            isDrawerOpen: false,
            setDrawerOpen: (isOpen) => set({ isDrawerOpen: isOpen }),

            addItem: (item) => {
                const maxQty = 5;
                // Determine stock based on variant if color/size is provided, or totalStock
                let stock = item.totalStock ?? 0;
                if (item.color && item.variants) {
                    const variant = item.variants.find(v => v.color === item.color);
                    if (variant) stock = variant.quantity ?? stock;
                }

                const price = Number(item.price ?? item.pricing?.sellingPrice ?? 0);
                const name = item.productName ?? item.name ?? '';
                const image = item.image ?? item.thumbnails?.[0] ?? item.variants?.[0]?.images?.[0] ?? item.images?.[0];
                
                const existItem = get().cartItems.find((x) => 
                    x._id === item._id && 
                    (x.size || '') === (item.size || '') && 
                    (x.color || '') === (item.color || '')
                );

                // Start with the quantity provided in the item object (from product page) or default to 1
                let addQty = item.qty ?? 1;
                
                // If item exists, we ADD the new quantity to the existing one
                let finalQty = existItem ? existItem.qty + addQty : addQty;

                // Strict Validation: Cannot add if out of stock
                if (stock <= 0) {
                    alert(`Sorry, ${name} is currently out of stock.`);
                    return;
                }

                // Enforce limits (Max 5 or Stock)
                if (finalQty > maxQty || finalQty > stock) {
                    const limit = Math.min(maxQty, stock);
                    if (existItem && existItem.qty >= limit) {
                        alert(`You already have the maximum available quantity (${limit}) in your cart.`);
                        return;
                    }
                    alert(`Quantity adjusted to ${limit} (Maximum available).`);
                    finalQty = limit;
                }

                if (finalQty < 1) finalQty = 1;

                const normalized = { ...item, price, name, image, qty: finalQty, countInStock: stock };

                if (existItem) {
                    set({
                        cartItems: get().cartItems.map((x) =>
                            x._id === existItem._id && x.size === existItem.size && x.color === existItem.color ? normalized : x
                        ),
                    });
                } else {
                    set({ cartItems: [...get().cartItems, normalized] });
                }
                set({ isDrawerOpen: true });
                trackAddToCart({ ...normalized, qty: addQty }, addQty);
            },

            updateQuantity: (id, size, color, newQty) => {
                const maxQty = 5;
                set({
                    cartItems: get().cartItems.map((x) => {
                        if (x._id === id && x.size === size && x.color === color) {
                            const stock = x.countInStock ?? 5; 
                            // Ensure it doesn't exceed stock even if user tries to force it
                            const finalQty = Math.min(Math.max(1, newQty), maxQty, stock);
                            return { ...x, qty: finalQty };
                        }
                        return x;
                    }),
                });
            },

            syncStock: async (productService) => {
                const { cartItems } = get();
                if (cartItems.length === 0) return;

                const updatedItems = await Promise.all(cartItems.map(async (item) => {
                    try {
                        const product = await productService.getById(item._id);
                        let stock = product.totalStock || 0;
                        if (item.color && product.variants) {
                            const variant = product.variants.find(v => v.color === item.color);
                            if (variant) stock = variant.quantity ?? stock;
                        }
                        
                        return { 
                            ...item, 
                            countInStock: stock,
                            qty: Math.min(item.qty, stock === 0 ? 1 : stock) // Don't set to 0 qty to avoid UI breakage, but stock will be 0
                        };
                    } catch (err) {
                        return item; // Fallback to current item if fetch fails
                    }
                }));

                set({ cartItems: updatedItems });
            },

            hasOutOfStockItems: () => {
                return get().cartItems.some(item => (item.countInStock ?? 1) < item.qty || item.countInStock === 0);
            },

            removeItem: (id, size, color) => {
                set({
                    cartItems: get().cartItems.filter((x) => !(x._id === id && x.size === size && x.color === color)),
                });
            },

            removeItems: (itemsToRemove) => {
                const { cartItems } = get();
                const remaining = cartItems.filter(item => 
                    !itemsToRemove.some(r => r._id === item._id && r.size === item.size && r.color === item.color)
                );
                set({ cartItems: remaining });
            },

            saveShippingAddress: (data) => set({ shippingAddress: data }),
            savePaymentMethod: (data) => set({ paymentMethod: data }),
            clearCart: () => set({ cartItems: [] }),

            /** Replace cart from abandoned-cart recovery payload (exact items/qty/prices). */
            rehydrateFromRecovery: ({ items, shippingAddress } = {}) => {
                const cartItems = (items || []).map((item) => ({
                    _id: String(item._id || item.productId || ""),
                    name: item.name || item.productName || "Product",
                    productName: item.productName || item.name || "Product",
                    price: Number(item.price) || 0,
                    qty: Math.max(1, Number(item.qty || item.quantity) || 1),
                    color: item.color || "",
                    size: item.size || "",
                    image: item.image || "",
                    countInStock: Number(item.countInStock) || 99,
                })).filter((item) => item._id);

                const next = { cartItems };
                if (shippingAddress && typeof shippingAddress === "object") {
                    next.shippingAddress = {
                        ...(get().shippingAddress || {}),
                        ...shippingAddress,
                    };
                }
                set(next);
            },
        }),
        {
            name: CART_STORAGE_KEY,
            partialize: (state) => ({
                cartItems: state.cartItems,
                shippingAddress: state.shippingAddress,
                paymentMethod: state.paymentMethod,
            }),
        }
    )
);
