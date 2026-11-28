from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import AdminAccount, Category, Product, Role
from app.main import create_app
from app.security import create_access_token
from app.services import collections as collections_svc


async def _product(name: str, *, category: str | None = "T-Shirt", status: str = "active") -> Product:
    product = Product(productName=name, slug=collections_svc.slugify(name), category=category, status=status)
    await product.insert()
    return product


def test_slugify():
    assert collections_svc.slugify("  Kerala Prints & More! ") == "kerala-prints-more"
    assert collections_svc.slugify("T-Shirt") == "t-shirt"


@pytest.mark.usefixtures("db")
async def test_create_rejects_duplicate_slug():
    await collections_svc.create({"name": "New Drop"})
    with pytest.raises(Exception) as exc:
        await collections_svc.create({"name": "new drop"})
    assert getattr(exc.value, "status_code", None) == 409


@pytest.mark.usefixtures("db")
async def test_add_remove_and_delete_keep_products_in_sync():
    tee = await _product("Mandala")
    hoodie = await _product("Elephant")
    drop = await collections_svc.create({"name": "New Drop"})
    kerala = await collections_svc.create({"name": "Kerala Prints"})

    await collections_svc.add_products(drop["_id"], [str(tee.id), str(hoodie.id), "not-an-id"])
    await collections_svc.add_products(kerala["_id"], [str(tee.id)])
    await collections_svc.add_products(drop["_id"], [str(tee.id)])  # no duplicate

    tee = await Product.get(tee.id)
    assert tee.collections == [drop["_id"], kerala["_id"]]

    detail = await collections_svc.remove_products(drop["_id"], [str(hoodie.id)])
    assert [p["_id"] for p in detail["products"]] == [str(tee.id)]

    await collections_svc.delete(drop["_id"])
    tee = await Product.get(tee.id)
    assert tee.collections == [kerala["_id"]]
    assert await Category.get(drop["_id"]) is None


@pytest.mark.usefixtures("db")
async def test_backfill_turns_categories_into_collections():
    tee = await _product("Mandala", category="T-Shirt")
    other = await _product("Elephant", category="t-shirt")
    loose = await _product("Plain", category=None)

    first = await collections_svc.backfill_from_categories()
    again = await collections_svc.backfill_from_categories()

    doc = await Category.find_one({"slug": "t-shirt"})
    assert doc and doc.name == "T-Shirt"
    assert first["collections_created"] == 1 and first["products_linked"] == 2
    assert again["collections_created"] == 0 and again["products_linked"] == 0
    for product in (tee, other):
        assert (await Product.get(product.id)).collections == [str(doc.id)]
    assert (await Product.get(loose.id)).collections == []


@pytest.mark.usefixtures("db")
async def test_storefront_lists_only_live_products_of_active_collection():
    live = await _product("Mandala")
    draft = await _product("Secret", status="draft")
    await _product("Elsewhere")
    drop = await collections_svc.create({"name": "New Drop"})
    hidden = await collections_svc.create({"name": "Hidden", "isActive": False})
    await collections_svc.add_products(drop["_id"], [str(live.id), str(draft.id)])
    await collections_svc.add_products(hidden["_id"], [str(live.id)])

    transport = ASGITransport(app=create_app(with_lifespan=False))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        listing = (await client.get("/api/products", params={"collection": "new-drop"})).json()
        hidden_listing = (await client.get("/api/products", params={"collection": "hidden"})).json()
        meta = await client.get("/api/collections/new-drop")
        hidden_meta = await client.get("/api/collections/hidden")
        index = (await client.get("/api/collections")).json()

    assert [p["_id"] for p in listing["products"]] == [str(live.id)]
    assert hidden_listing["total"] == 0
    assert meta.status_code == 200 and meta.json()["name"] == "New Drop"
    assert hidden_meta.status_code == 404
    assert [(c["slug"], c["productCount"]) for c in index] == [("new-drop", 1)]

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        detail = (await client.get(f"/api/products/{live.id}")).json()
    # Hidden collections stay out of breadcrumbs.
    assert detail["collectionLinks"] == [{"name": "New Drop", "slug": "new-drop"}]


@pytest.mark.usefixtures("db")
async def test_admin_routes_require_admin_and_manage_membership():
    role = Role(name="Owner", permissions=["*"])
    await role.insert()
    admin = AdminAccount(email="owner@example.com", name="Owner", roleId=str(role.id))
    await admin.insert()
    tee = await _product("Mandala")

    transport = ASGITransport(app=create_app(with_lifespan=False))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        assert (await client.get("/api/admin/collections")).status_code == 401

        client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
        created = await client.post("/api/admin/collections", json={"name": "New Drop", "description": "Fresh"})
        assert created.status_code == 201
        cid = created.json()["_id"]

        added = await client.post(f"/api/admin/collections/{cid}/products", json={"productIds": [str(tee.id)]})
        assert [p["name"] for p in added.json()["products"]] == ["Mandala"]

        renamed = await client.put(
            f"/api/admin/collections/{cid}",
            json={
                "name": "Drop 01",
                "slug": "drop-01",
                "metaTitle": "  Drop 01 — Kerala streetwear ",
                "metaDescription": "Limited tees.",
            },
        )
        assert renamed.json()["slug"] == "drop-01" and renamed.json()["productCount"] == 1
        assert renamed.json()["metaTitle"] == "Drop 01 — Kerala streetwear"
        public = (await client.get("/api/collections/drop-01")).json()
        assert public["metaDescription"] == "Limited tees."

        removed = await client.post(f"/api/admin/collections/{cid}/products/remove", json={"productIds": [str(tee.id)]})
        assert removed.json()["products"] == []


@pytest.mark.usefixtures("db")
async def test_new_product_joins_its_category_collection():
    tees = await collections_svc.create({"name": "T-Shirt"})
    product = await _product("Fresh Drop", category="T-Shirt")
    await collections_svc.file_new_product(product)
    await collections_svc.file_new_product(product)  # idempotent
    assert (await Product.get(product.id)).collections == [tees["_id"]]

    loose = await _product("Cap", category="Caps")
    await collections_svc.file_new_product(loose)
    assert (await Product.get(loose.id)).collections == []


@pytest.mark.usefixtures("db")
async def test_legacy_category_routes_share_collection_rules():
    role = Role(name="Owner", permissions=["*"])
    await role.insert()
    admin = AdminAccount(email="owner@example.com", name="Owner", roleId=str(role.id))
    await admin.insert()
    tee = await _product("Mandala")

    transport = ASGITransport(app=create_app(with_lifespan=False))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
        created = (await client.post("/api/admin/categories", json={"name": "Hoodies "})).json()
        assert created["slug"] == "hoodies"
        assert (await client.post("/api/admin/categories", json={"name": "hoodies"})).status_code == 409
        await collections_svc.add_products(created["_id"], [str(tee.id)])
        assert (await client.delete(f"/api/admin/categories/{created['_id']}")).status_code == 200

    assert (await Product.get(tee.id)).collections == []


@pytest.mark.usefixtures("db")
async def test_backfill_normalises_legacy_slugs():
    legacy = Category(name="T-Shirt", slug="T-Shirts ")
    await legacy.insert()
    await _product("Mandala", category="T-Shirts")
    await collections_svc.backfill_from_categories()
    assert (await Category.get(legacy.id)).slug == "t-shirts"
    assert await collections_svc.by_slug("t-shirts") is not None
