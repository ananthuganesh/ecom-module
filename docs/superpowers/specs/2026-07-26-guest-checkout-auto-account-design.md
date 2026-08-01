# Guest checkout + auto account — design

**Date:** 2026-07-26 · **Updated:** 2026-07-28 (email-first)

## Goal

Best conversion path: no login/guest fork. Email is the first checkout field; every order attaches to a customer record. An “account” means that record has a password set.

## Flow

1. Browse + add to cart — no login (cart in `urban-aana-cart` localStorage).
2. Checkout asks for email first (required).
3. Behind the scenes `POST /api/users/checkout-email` finds or creates the customer and issues a session token.
4. If the email already has a password → gentle “log in to use saved details?” with skip.
5. If new / passwordless → continue as guest; shipping + payment proceed normally.
6. After purchase → optional “Create a password to track your order.”
7. Token stored in `urban-aana-auth` → return visits on the same browser stay signed in.
