"""Reject obvious fake / typo emails (e.g. ddsgmail.com → gmail.com)."""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, EmailStr

_BASIC = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Domains that are common misspellings of popular providers.
TYPO_DOMAINS: dict[str, str] = {
    "ddsgmail.com": "gmail.com",
    "gamil.com": "gmail.com",
    "gmial.com": "gmail.com",
    "gmaill.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "gmail.cm": "gmail.com",
    "gmail.om": "gmail.com",
    "gmailcom.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gnail.com": "gmail.com",
    "googlemail.co": "gmail.com",
    "hotmal.com": "hotmail.com",
    "hotmial.com": "hotmail.com",
    "hotmail.co": "hotmail.com",
    "hotmail.con": "hotmail.com",
    "outlok.com": "outlook.com",
    "outloo.com": "outlook.com",
    "outlook.con": "outlook.com",
    "yaho.com": "yahoo.com",
    "yahooo.com": "yahoo.com",
    "yahoocom.com": "yahoo.com",
    "yahoo.con": "yahoo.com",
    "ymail.con": "ymail.com",
    "icloud.con": "icloud.com",
    "rediffmail.con": "rediffmail.com",
    "rediffmai.com": "rediffmail.com",
}

# If the domain label contains a brand token but is not one of the allowed
# domains, treat it as a spoof/typo (covers ddsgmail.com, mygmail.in, etc.).
BRAND_DOMAINS: dict[str, set[str]] = {
    "gmail": {"gmail.com", "googlemail.com"},
    "googlemail": {"gmail.com", "googlemail.com"},
    "yahoo": {"yahoo.com", "yahoo.co.in", "ymail.com"},
    "ymail": {"ymail.com", "yahoo.com", "yahoo.co.in"},
    "hotmail": {"hotmail.com", "hotmail.co.in"},
    "outlook": {"outlook.com", "outlook.in", "live.com", "hotmail.com"},
    "icloud": {"icloud.com", "me.com", "mac.com"},
    "rediffmail": {"rediffmail.com"},
}


def _domain_of(email: str) -> str:
    return email.rsplit("@", 1)[-1].strip().lower()


def suggest_email_domain(domain: str) -> str | None:
    d = (domain or "").strip().lower()
    if not d:
        return None
    if d in TYPO_DOMAINS:
        return TYPO_DOMAINS[d]
    for brand, allowed in BRAND_DOMAINS.items():
        if brand in d and d not in allowed:
            # Prefer the primary brand domain
            return next(iter(sorted(allowed, key=len)))
    return None


def email_quality_error(email: str) -> str | None:
    """Return a user-facing error if email looks fake/typo; else None."""
    value = (email or "").strip().lower()
    if not value or not _BASIC.match(value):
        return "Enter a valid email."
    domain = _domain_of(value)
    if "." not in domain or domain.startswith(".") or domain.endswith("."):
        return "Enter a valid email."

    suggestion = suggest_email_domain(domain)
    if suggestion and suggestion != domain:
        return f"Email domain looks incorrect. Did you mean {suggestion}?"

    return None


def assert_email_quality(email: str) -> str:
    """Normalize email or raise ValueError (for Pydantic AfterValidator)."""
    value = (email or "").strip().lower()
    err = email_quality_error(value)
    if err:
        raise ValueError(err)
    return value


QualityEmail = Annotated[EmailStr, AfterValidator(assert_email_quality)]
