from __future__ import annotations

import pytest
from bson import ObjectId
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.documents import Order, OrderItem, Product, Review, User
from app.main import create_app
from app.security import create_access_token
from app.services import reviews


async def _product(**overrides) -> Product:
    product = Product(**{"productName": "Indian Elephant", "slug": "indian-elephant", **overrides})
    await product.insert()
    return product


async def _user(name="Arjun Menon", email="arjun@example.com") -> User:
    user = User(name=name, email=email)
    await user.insert()
    return user


async def _order(user: User, product: Product, *, status="delivered", as_object_ids=False, **extra):
    order = Order(
        customerId=user.id if as_object_ids else str(user.id),
        status=status,
        items=[
            OrderItem(
                productId=product.id if as_object_ids else str(product.id),
                productName=product.productName,
                size="M",
            )
        ],
        **extra,
    )
    await order.insert()
    return order


async def _reload(product: Product) -> Product:
    return await Product.get(product.id)


# ---------------------------------------------------------------- who can review


@pytest.mark.usefixtures("db")
async def test_verified_buyer_can_review():
    product, user = await _product(), await _user()
    await _order(user, product)

    review, created = await reviews.submit_review(
        str(product.id), user, rating=5, title="  Fits  great ", body="Heavy cotton."
    )
    assert created is True
    assert review.status == "published"
    assert review.title == "Fits great"
    assert review.size == "M"
    assert review.authorName == "Arjun M."


@pytest.mark.parametrize("status", ["order placed", "processing", "cancelled"])
@pytest.mark.usefixtures("db")
async def test_undelivered_orders_do_not_qualify(status):
    product, user = await _product(), await _user()
    await _order(user, product, status=status)
    with pytest.raises(HTTPException) as exc:
        await reviews.submit_review(str(product.id), user, rating=4)
    assert exc.value.status_code == 403


@pytest.mark.usefixtures("db")
async def test_someone_who_never_ordered_cannot_review():
    product, user = await _product(), await _user()
    state = await reviews.my_review_state(str(product.id), user)
    assert state["canReview"] is False
    with pytest.raises(HTTPException):
        await reviews.submit_review(str(product.id), user, rating=4)


@pytest.mark.usefixtures("db")
async def test_returned_order_still_counts_as_received():
    product, user = await _product(), await _user()
    await _order(user, product, status="returned")
    _, created = await reviews.submit_review(str(product.id), user, rating=2)
    assert created


@pytest.mark.usefixtures("db")
async def test_legacy_object_id_orders_qualify():
    product, user = await _product(), await _user()
    await _order(user, product, status="shipped", isDelivered=True, as_object_ids=True)
    assert (await reviews.my_review_state(str(product.id), user))["canReview"] is True


@pytest.mark.usefixtures("db")
async def test_another_customers_order_does_not_qualify():
    product = await _product()
    buyer, other = await _user(), await _user("Other", "other@example.com")
    await _order(buyer, product)
    with pytest.raises(HTTPException):
        await reviews.submit_review(str(product.id), other, rating=5)


# ---------------------------------------------------------------- validation


@pytest.mark.parametrize("bad", [0, 6, 4.5, "five", None, True, "nan"])
@pytest.mark.usefixtures("db")
async def test_rating_must_be_a_whole_star(bad):
    product, user = await _product(), await _user()
    await _order(user, product)
    with pytest.raises(HTTPException) as exc:
        await reviews.submit_review(str(product.id), user, rating=bad)
    assert exc.value.status_code == 400


@pytest.mark.usefixtures("db")
async def test_string_ratings_from_forms_are_accepted():
    product, user = await _product(), await _user()
    await _order(user, product)
    review, _ = await reviews.submit_review(str(product.id), user, rating="4")
    assert review.rating == 4


@pytest.mark.usefixtures("db")
async def test_overlong_text_is_refused():
    product, user = await _product(), await _user()
    await _order(user, product)
    with pytest.raises(HTTPException):
        await reviews.submit_review(str(product.id), user, rating=4, title="x" * 121)
    with pytest.raises(HTTPException):
        await reviews.submit_review(str(product.id), user, rating=4, body="x" * 2001)


@pytest.mark.usefixtures("db")
async def test_draft_or_missing_product_is_404():
    user = await _user()
    with pytest.raises(HTTPException) as exc:
        await reviews.submit_review(str(ObjectId()), user, rating=4)
    assert exc.value.status_code == 404
    draft = await _product(status="draft")
    with pytest.raises(HTTPException):
        await reviews.list_published(str(draft.id))


def test_author_name_never_exposes_more_than_an_initial():
    assert reviews.public_author_name(User(name="arjun  k menon", email="a@b.com")) == "arjun M."
    assert reviews.public_author_name(User(name="Priya", email="p@b.com")) == "Priya"
    assert reviews.public_author_name(User(name="", email="secret@b.com")) == "Verified buyer"


# ---------------------------------------------------------------- one per customer


@pytest.mark.usefixtures("db")
async def test_second_submit_edits_the_first():
    product, user = await _product(), await _user()
    await _order(user, product)
    await reviews.submit_review(str(product.id), user, rating=2, body="Shrunk")
    review, created = await reviews.submit_review(str(product.id), user, rating=4, body="Fine after all")
    assert created is False
    assert review.rating == 4
    assert await Review.find_all().count() == 1
    assert (await _reload(product)).ratingAverage == 4


@pytest.mark.usefixtures("db")
async def test_editing_does_not_unhide_a_hidden_review():
    product, user = await _product(), await _user()
    await _order(user, product)
    review, _ = await reviews.submit_review(str(product.id), user, rating=1, body="spam")
    await reviews.set_status(str(review.id), "hidden")
    edited, _ = await reviews.submit_review(str(product.id), user, rating=5, body="still spam")
    assert edited.status == "hidden"
    assert (await _reload(product)).ratingCount == 0


# ---------------------------------------------------------------- rating maths


@pytest.mark.usefixtures("db")
async def test_average_and_count_track_published_reviews():
    product = await _product()
    for i, stars in enumerate([5, 4, 4]):
        user = await _user(f"Buyer {i}", f"b{i}@example.com")
        await _order(user, product)
        await reviews.submit_review(str(product.id), user, rating=stars)

    fresh = await _reload(product)
    assert fresh.ratingCount == 3
    assert fresh.ratingAverage == 4.3

    listing = await reviews.list_published(str(product.id))
    assert listing["summary"] == {
        "average": 4.3,
        "count": 3,
        "distribution": {"5": 1, "4": 2, "3": 0, "2": 0, "1": 0},
    }


@pytest.mark.usefixtures("db")
async def test_hiding_removes_a_review_from_listing_and_rating():
    product = await _product()
    ids = []
    for i, stars in enumerate([5, 1]):
        user = await _user(f"Buyer {i}", f"b{i}@example.com")
        await _order(user, product)
        review, _ = await reviews.submit_review(str(product.id), user, rating=stars)
        ids.append(str(review.id))

    await reviews.set_status(ids[1], "hidden")
    fresh = await _reload(product)
    assert (fresh.ratingAverage, fresh.ratingCount) == (5, 1)
    listing = await reviews.list_published(str(product.id))
    assert [r["_id"] for r in listing["reviews"]] == [ids[0]]

    await reviews.set_status(ids[1], "published")
    assert (await _reload(product)).ratingAverage == 3


@pytest.mark.usefixtures("db")
async def test_public_listing_leaks_no_customer_data():
    product, user = await _product(), await _user()
    await _order(user, product)
    await reviews.submit_review(str(product.id), user, rating=5, body="Love it")
    row = (await reviews.list_published(str(product.id)))["reviews"][0]
    assert set(row) == {"_id", "rating", "title", "body", "authorName", "size", "verified", "createdAt", "updatedAt"}
    assert "arjun@example.com" not in str(row)


@pytest.mark.usefixtures("db")
async def test_sort_and_paging():
    product = await _product()
    for i, stars in enumerate([3, 5, 1]):
        user = await _user(f"Buyer {i}", f"b{i}@example.com")
        await _order(user, product)
        await reviews.submit_review(str(product.id), user, rating=stars)
    highest = await reviews.list_published(str(product.id), sort="highest", page_size=2)
    assert [r["rating"] for r in highest["reviews"]] == [5, 3]
    assert highest["pages"] == 2
    lowest = await reviews.list_published(str(product.id), sort="lowest")
    assert lowest["reviews"][0]["rating"] == 1


@pytest.mark.usefixtures("db")
async def test_bad_status_is_refused():
    with pytest.raises(HTTPException) as exc:
        await reviews.set_status(str(ObjectId()), "deleted")
    assert exc.value.status_code == 400


# ---------------------------------------------------------------- over http


@pytest.fixture
async def client(db):
    async with AsyncClient(
        transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test"
    ) as ac:
        yield ac


async def test_http_flow(client):
    product, user = await _product(), await _user()
    await _order(user, product)
    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    url = f"/api/products/{product.id}/reviews"

    assert (await client.put(f"{url}/me", json={"rating": 5})).status_code == 401

    me = await client.get(f"{url}/me", headers=headers)
    assert me.status_code == 200 and me.json()["canReview"] is True

    written = await client.put(
        f"{url}/me", json={"rating": 5, "title": "Solid", "body": "Great tee"}, headers=headers
    )
    assert written.status_code == 200
    assert written.json()["created"] is True

    public = (await client.get(url)).json()
    assert public["summary"]["count"] == 1
    assert public["reviews"][0]["title"] == "Solid"


async def test_admin_endpoints_need_staff(client):
    user = await _user()
    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    assert (await client.get("/api/admin/reviews", headers=headers)).status_code in (401, 403)


@pytest.mark.usefixtures("db")
async def test_admin_listing_shows_hidden_reviews_with_product_names():
    from app.routers import reviews as router

    product, user = await _product(), await _user()
    await _order(user, product)
    review, _ = await reviews.submit_review(str(product.id), user, rating=1, body="bad")
    await router.hide_review(str(review.id), None)

    hidden = await router.list_reviews(None, status="hidden", rating=None, q=None, page=1, pageSize=25)
    assert hidden["total"] == 1 and hidden["hiddenCount"] == 1
    row = hidden["reviews"][0]
    assert row["productName"] == "Indian Elephant"
    assert row["status"] == "hidden"

    found = await router.list_reviews(None, status="all", rating=1, q="BAD", page=1, pageSize=25)
    assert found["total"] == 1
