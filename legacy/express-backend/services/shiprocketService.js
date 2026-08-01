import axios from 'axios';
import Setting from '../models/settingModel.js';

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

class ShiprocketService {
    static tokenPromise = null;

    static async getToken() {
        // If a token request is already in flight, reuse that promise to avoid race conditions
        if (this.tokenPromise) return this.tokenPromise;

        const fetchToken = async () => {
            const setting = await Setting.findOne({ key: 'shiprocket_token' });
            
            if (setting && setting.value.token && new Date() < new Date(setting.value.expiresAt)) {
                return setting.value.token;
            }

            try {
                const email = process.env.SHIPROCKET_EMAIL;
                const password = process.env.SHIPROCKET_PASSWORD;

                if (!email || !password) {
                    throw new Error('Shiprocket credentials missing');
                }

                const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, { email, password });
                const token = response.data.token;
                const expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + 230);

                await Setting.findOneAndUpdate(
                    { key: 'shiprocket_token' },
                    { key: 'shiprocket_token', value: { token, expiresAt } },
                    { upsert: true, new: true }
                );

                return token;
            } catch (error) {
                console.error('[Shiprocket Auth Error]:', error.response?.data || error.message);
                throw new Error('Shipping partner authentication failed');
            } finally {
                this.tokenPromise = null; // Reset for next time if it fails or completes
            }
        };

        this.tokenPromise = fetchToken();
        return this.tokenPromise;
    }

    static async getHeaders() {
        const token = await this.getToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    static async createOrder(order, user) {
        try {
            const headers = await this.getHeaders();
            
            // Populate order items to get product names if missing
            const populatedOrder = await order.populate('items.productId', 'productName product thumbnails');
            
            // Map our order to Shiprocket adhoc order format
            // Robust mapping: many users put state in country field or vice versa
            const addr = order.shippingAddress || {};
            const country = (addr.country && addr.country.toLowerCase() === 'india') ? 'India' : 'India'; // Shiprocket mostly used for India
            const state = addr.state || (addr.country !== 'India' ? addr.country : 'Delhi');
            const pincode = String(addr.postalCode || '110001').padStart(6, '0');

            // Helper to proper case strings (e.g. "kerala" -> "Kerala")
            const toProperCase = (str) => {
                if (!str) return "";
                return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            };

            const payload = {
                order_id: order._id.toString(),
                order_date: new Date(order.createdAt).toISOString().split('T')[0],
                pickup_location: "Primary", // This must match a nickname in Shiprocket dashboard
                billing_customer_name: (addr.name || user.name || "Customer").split(' ')[0] || "Customer",
                billing_last_name: (addr.name || user.name || "").split(' ').slice(1).join(' ') || "Delivery",
                billing_address: ((addr.address || "") + (addr.address?.length < 10 && addr.address2 ? ", " + addr.address2 : "")).substring(0, 50) || "No Address Provided",
                billing_address_2: (addr.address2 || "").substring(0, 50),
                billing_city: toProperCase(addr.city || "Delhi"),
                billing_pincode: pincode,
                billing_state: toProperCase(state),
                billing_country: country,
                billing_email: user.email || "customer@example.com",
                billing_phone: addr.phone || user.phone || "9999999999",
                shipping_is_billing: 1, // Using numeric 1 as some Shiprocket API versions prefer it
                shipping_customer_name: (addr.name || user.name || "Customer").split(' ')[0] || "Customer",
                shipping_last_name: (addr.name || user.name || "").split(' ').slice(1).join(' ') || "Delivery",
                shipping_address: ((addr.address || "") + (addr.address?.length < 10 && addr.address2 ? ", " + addr.address2 : "")).substring(0, 50) || "No Address Provided",
                shipping_address_2: (addr.address2 || "").substring(0, 50),
                shipping_city: toProperCase(addr.city || "Delhi"),
                shipping_pincode: pincode,
                shipping_country: country,
                shipping_state: toProperCase(state),
                shipping_email: user.email || "customer@example.com",
                shipping_phone: addr.phone || user.phone || "9999999999",
                order_items: populatedOrder.items.map(item => {
                    const product = item.productId;
                    const name = product?.productName || product?.product || "Product Item";
                    return {
                        name: name.substring(0, 50),
                        sku: product?._id?.toString() || item.productId?.toString(),
                        units: item.quantity,
                        selling_price: item.price,
                    };
                }),
                payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
                sub_total: order.total || order.finalPrice,
                shipping_charges: order.deliveryAmount || 0,
                total_discount: 0,
                length: 10,
                width: 10,
                height: 10,
                weight: 0.5
            };

            console.log('Sending to Shiprocket:', JSON.stringify(payload, null, 2));

            const response = await axios.post(`${SHIPROCKET_BASE_URL}/orders/create/adhoc`, payload, { headers });
            return response.data;
        } catch (error) {
            const errorData = error.response?.data;
            
            // Check for duplicate order (Idempotency)
            if (errorData?.status_code === 422 && (errorData?.message?.includes('already exists') || errorData?.errors?.order_id)) {
                console.log(`[Shiprocket] Order #${order._id} already exists. Fetching existing details...`);
                return await this.fetchOrderByExternalId(order._id.toString());
            }

            console.error('Shiprocket Create Order Error:', errorData || error.message);
            throw error;
        }
    }

    static async fetchOrderByExternalId(orderId) {
        try {
            const headers = await this.getHeaders();
            const response = await axios.get(`${SHIPROCKET_BASE_URL}/orders/external/${orderId}`, { headers });
            // Shiprocket returns data in a slightly different format here
            const data = response.data.data;
            return {
                order_id: data.id,
                shipment_id: data.shipments?.[0]?.id,
                status: data.status
            };
        } catch (error) {
            console.error('[Shiprocket] Fetch order error:', error.response?.data || error.message);
            throw error;
        }
    }

    static async assignAWB(shipmentId) {
        try {
            const headers = await this.getHeaders();
            const response = await axios.post(`${SHIPROCKET_BASE_URL}/courier/assign/awb`, {
                shipment_id: shipmentId
            }, { headers });
            return response.data;
        } catch (error) {
            console.error('Shiprocket Assign AWB Error:', error.response?.data || error.message);
            throw error;
        }
    }

    static async generatePickup(shipmentId) {
        try {
            const headers = await this.getHeaders();
            const response = await axios.post(`${SHIPROCKET_BASE_URL}/courier/generate/pickup`, {
                shipment_id: [shipmentId]
            }, { headers });
            return response.data;
        } catch (error) {
            console.error('Shiprocket Generate Pickup Error:', error.response?.data || error.message);
            throw error;
        }
    }

    static async trackAWB(awbCode) {
        try {
            const headers = await this.getHeaders();
            const response = await axios.get(`${SHIPROCKET_BASE_URL}/courier/track/awb/${awbCode}`, { headers });
            return response.data;
        } catch (error) {
            console.error('Shiprocket Track AWB Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Handles the entire Shiprocket flow: Create Order -> Assign AWB -> Generate Pickup
     * @param {Object} order - The Mongoose Order document
     * @param {Object} user - The Mongoose User document
     * @returns {Promise<Object>} Updated order document
     */
    static async processFullOrderFlow(order, user) {
        try {
            console.log(`[Shiprocket] Processing full flow for Order #${order._id}`);
            
            // 1. Create order in Shiprocket
            const srOrder = await this.createOrder(order, user);
            const shipmentId = srOrder.shipment_id;
            
            order.shiprocketOrderId = srOrder.order_id;
            order.shipmentId = shipmentId;

            // 2. Assign AWB
            try {
                const awbData = await this.assignAWB(shipmentId);
                if (awbData && awbData.response && awbData.response.data) {
                    order.awbCode = awbData.response.data.awb_code;
                    order.courierName = awbData.response.data.courier_name;
                }
            } catch (awbError) {
                console.warn(`[Shiprocket] AWB Assignment failed for #${order._id}:`, awbError.message);
                // Non-fatal, can be assigned manually later
            }

            // 3. Generate Pickup
            try {
                await this.generatePickup(shipmentId);
                order.shippingStatus = 'Pickup Scheduled';
            } catch (pickupError) {
                console.warn(`[Shiprocket] Pickup Generation failed for #${order._id}:`, pickupError.message);
                order.shippingStatus = 'Shipping Pending';
            }

            return await order.save();
        } catch (error) {
            console.error(`[Shiprocket] Flow failed for #${order._id}:`, error.message);
            order.shippingStatus = 'Shipping Failed';
            return await order.save();
        }
    }
}

export default ShiprocketService;
