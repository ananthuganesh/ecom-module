from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.db import close_db, init_db
from app.routers import abandoned, admin, collections, coupons, erp, gtm, media, orders, payments, products, shipping, stock_admin, users


@asynccontextmanager
async def lifespan(_: FastAPI):
    import asyncio

    from app.services import aisensy as aisensy_svc

    get_settings().assert_production_secrets()
    await init_db()
    stop_event = asyncio.Event()
    abandoned_task = asyncio.create_task(aisensy_svc.abandoned_recovery_loop(stop_event))
    from app.services.stock_reserve_sweeper import stock_reserve_sweeper_loop

    stock_task = asyncio.create_task(stock_reserve_sweeper_loop(stop_event))
    from app.services.dtdc_status_sync import shipment_status_sync_loop

    dtdc_sync_task = asyncio.create_task(shipment_status_sync_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        abandoned_task.cancel()
        stock_task.cancel()
        dtdc_sync_task.cancel()
        for task in (abandoned_task, stock_task, dtdc_sync_task):
            try:
                await task
            except asyncio.CancelledError:
                pass
        await close_db()


def create_app(*, with_lifespan: bool = True) -> FastAPI:
    settings = get_settings()
    docs_url = None if settings.is_production() else "/docs"
    redoc_url = None if settings.is_production() else "/redoc"
    openapi_url = None if settings.is_production() else "/openapi.json"
    app = FastAPI(
        title="Urban Aana API",
        version="2.0.0",
        lifespan=lifespan if with_lifespan else None,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )

    origins = settings.cors_origins
    if origins is None:
        # Dev only: reflect common local origins (never wildcard + credentials).
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
        )

    @app.get("/")
    async def root():
        return {"message": "Urban Aana FastAPI backend"}

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "backend": "fastapi"}

    @app.api_route("/api/stripe/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def stripe_gone(path: str = ""):
        return JSONResponse({"detail": "Stripe removed; use Razorpay"}, status_code=410)

    app.include_router(users.router)
    app.include_router(products.router)
    app.include_router(orders.router)
    app.include_router(payments.router)
    app.include_router(shipping.router)
    app.include_router(coupons.router)
    app.include_router(collections.router)
    app.include_router(admin.router)
    app.include_router(media.router)
    app.include_router(stock_admin.router)
    app.include_router(erp.router)
    app.include_router(abandoned.router)
    app.include_router(gtm.router)

    upload_root = Path(__file__).resolve().parent.parent / "uploads"
    upload_root.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_root)), name="uploads")
    return app


app = create_app()
