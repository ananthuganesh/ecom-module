"""Allowlist sanitising for admin-authored rich text shown on the storefront.

The storefront renders product descriptions as HTML. Anything not on this list
is removed, rather than trying to recognise every dangerous construct.
"""

from __future__ import annotations

import re
from typing import Any

import nh3

ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "span",
    "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a",
}
ALLOWED_ATTRIBUTES = {"a": {"href", "title"}}
ALLOWED_URL_SCHEMES = {"http", "https", "mailto", "tel"}
_LOOKS_LIKE_HTML = re.compile(r"</?[a-z][\s\S]*>", re.IGNORECASE)


def sanitize_rich_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    # Plain text is rendered as text, so escaping it would show "&amp;" to shoppers.
    if not _LOOKS_LIKE_HTML.search(text):
        return text
    return nh3.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_URL_SCHEMES,
        link_rel="noopener noreferrer nofollow",
        strip_comments=True,
    )
