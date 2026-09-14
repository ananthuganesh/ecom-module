from __future__ import annotations

import os

os.environ["ENVIRONMENT"] = "test"
os.environ["NODE_ENV"] = "test"
os.environ["JWT_SECRET"] = "unit-test-jwt-secret-value-32chars+"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "whsec_test_secret"
os.environ["RAZORPAY_LIVE_API_KEY"] = "rzp_test_key"
os.environ["RAZORPAY_LIVE_KEY_SECRET"] = "rzp_test_secret"
os.environ["ALLOWED_ORIGINS"] = "http://test.local"
os.environ["MONGO_URI"] = "mongodb://127.0.0.1:27017/urbanaana_test"

from app.config import get_settings

get_settings.cache_clear()

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.db import close_db, init_db


def _create_indexes_keeping_partial_filters(self, indexes, session=None):
    """mongomock's create_indexes drops partialFilterExpression (Atlas honours it).

    Order.orderNumber relies on a partial unique index so unpaid, unnumbered
    orders don't collide on null; without this the test DB would reject them.
    """
    return [
        self.create_index(
            index.document["key"].items(),
            session=session,
            expireAfterSeconds=index.document.get("expireAfterSeconds"),
            unique=index.document.get("unique", False),
            sparse=index.document.get("sparse", False),
            name=index.document.get("name"),
            partialFilterExpression=index.document.get("partialFilterExpression"),
        )
        for index in indexes
    ]


import mongomock.collection  # noqa: E402

mongomock.collection.Collection.create_indexes = _create_indexes_keeping_partial_filters


@pytest.fixture
async def db():
    client = AsyncMongoMockClient()
    await init_db(client=client, db_name="urbanaana_test")
    try:
        yield client
    finally:
        await close_db()
