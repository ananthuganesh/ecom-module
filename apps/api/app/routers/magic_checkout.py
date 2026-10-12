"""Endpoints Razorpay calls while a shopper is in the Magic Checkout popup.

Register these in the Razorpay Dashboard (Magic Checkout → Platform Setup →
Custom E-Commerce Platform):

- Shipping info:      {site}/api/payments/magic/shipping-info
- Get promotions:     {site}/api/payments/magic/promotions
- Apply promotion:    {site}/api/payments/magic/apply-promotion

Razorpay sends no signature, and the docs ask for them to be unauthenticated.
They only quote: nothing here can take money or confirm an order, and the
amount paid is checked against our own rates after payment
(services/magic_checkout.prepare_paid_order). The docs show these as both GET
and POST with a JSON body, so both are accepted.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.services import magic_checkout
from app.services.rate_limit import rate_limit_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payments/magic", tags=["payments"])

# Calls come from Razorpay's servers, so one IP carries every shopper's checkout.
_razorpay_rate_limit = rate_limit_dependency("magic-checkout", limit=600)


async def _json_body(request: Request) -> dict:
    raw = await request.body()
    if not raw:
        return {}
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return {}
    return body if isinstance(body, dict) else {}


@router.api_route("/shipping-info", methods=["GET", "POST"])
async def shipping_info(request: Request, _: None = Depends(_razorpay_rate_limit)):
    return await magic_checkout.shipping_info(await _json_body(request))


@router.api_route("/promotions", methods=["GET", "POST"])
async def get_promotions(request: Request, _: None = Depends(_razorpay_rate_limit)):
    return await magic_checkout.get_promotions(await _json_body(request))


@router.api_route("/apply-promotion", methods=["GET", "POST"])
async def apply_promotion(request: Request, _: None = Depends(_razorpay_rate_limit)):
    ok, body = await magic_checkout.apply_promotion(await _json_body(request))
    if not ok:
        logger.info("Magic Checkout promotion refused: %s", body.get("failure_reason"))
    return JSONResponse(body, status_code=200 if ok else 400)
