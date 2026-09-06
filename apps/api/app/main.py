import logging
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pymongo.errors import ConnectionFailure

from app.config import get_settings
from app.db import close_db, init_db
from app.routers import abandoned, admin, contact, coupons, erp, media, orders, payments, products, shipping, stock_admin, users

logger = logging.getLogger(__name__)


def _init_sentry() -> None:
    """Initialize Sentry before the FastAPI app is created (auto FastAPI integration)."""
    settings = get_settings()
    dsn = str(settings.sentry_dsn or "").strip()
    if not dsn:
        return
    rate = float(settings.sentry_traces_sample_rate)
    if settings.is_production() and rate >= 1.0:
        rate = 0.1
    sentry_sdk.init(
        dsn=dsn,
        # Add data like request headers and IP for users,
        # see https://docs.sentry.io/platforms/python/data-management/data-collected/
        send_default_pii=True,
        traces_sample_rate=max(0.0, min(1.0, rate)),
        environment=str(settings.environment or settings.node_env or "development"),
    )


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
    from app.services.monthly_report import monthly_report_loop

    monthly_report_task = asyncio.create_task(monthly_report_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        abandoned_task.cancel()
        stock_task.cancel()
        dtdc_sync_task.cancel()
        monthly_report_task.cancel()
        for task in (abandoned_task, stock_task, dtdc_sync_task, monthly_report_task):
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

    @app.exception_handler(ConnectionFailure)
    async def mongodb_unavailable(_request, exc: ConnectionFailure):
        logger.warning("MongoDB connection failure: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "Database temporarily unavailable"},
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

    # Dev-only Sentry smoke test — never expose in production.
    if str(settings.sentry_dsn or "").strip() and not settings.is_production():
        @app.get("/sentry-debug")
        async def trigger_error():
            division_by_zero = 1 / 0  # noqa: F841

    app.include_router(users.router)
    app.include_router(products.router)
    app.include_router(orders.router)
    app.include_router(payments.router)
    app.include_router(shipping.router)
    app.include_router(coupons.router)
    app.include_router(contact.router)
    app.include_router(admin.router)
    app.include_router(media.router)
    app.include_router(media.public_router)
    app.include_router(stock_admin.router)
    app.include_router(erp.router)
    app.include_router(abandoned.router)

    upload_root = Path(__file__).resolve().parent.parent / "uploads"
    upload_root.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_root)), name="uploads")
    return app


_init_sentry()
app = create_app()
