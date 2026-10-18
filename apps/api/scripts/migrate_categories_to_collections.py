"""Turn each product category name (e.g. "T-Shirt") into a collection and add its products.

Run once after deploying collections:

    cd apps/api && .venv/bin/python -m scripts.migrate_categories_to_collections

Safe to re-run, but a re-run puts back any product an admin has since removed
from a migrated collection — so run it once, before curating.
"""

from __future__ import annotations

import asyncio

from app.db import init_db
from app.services.collections import backfill_from_categories


async def main() -> None:
    await init_db()
    print(await backfill_from_categories())


if __name__ == "__main__":
    asyncio.run(main())
