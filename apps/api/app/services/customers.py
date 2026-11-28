"""Customer vs staff query helpers."""

from __future__ import annotations


def customer_mongo_filter() -> dict:
    """Storefront customers only — never staff/admin accounts."""
    return {
        "isAdmin": {"$ne": True},
        "$and": [
            {
                "$or": [
                    {"roleId": None},
                    {"roleId": ""},
                    {"roleId": {"$exists": False}},
                ]
            }
        ],
    }
