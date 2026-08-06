"""Shopify-style transactional email layout for Urban Aana."""

from __future__ import annotations

import html
from datetime import datetime

# Shopify-like tokens with Urban Aana brand accent
BG_OUTER = "#ffffff"
BG_CARD = "#ffffff"
TEXT_PRIMARY = "#202223"
TEXT_MUTED = "#6d7175"
BORDER = "#c9cccf"
ACCENT = "#df1721"  # Urban Aana red (strip / links)
CTA_BG = "#000000"  # Primary button fill
LINK = "#df1721"
FONT_STACK = (
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "
    "'Helvetica Neue', Arial, sans-serif"
)

SITE_URL_DEFAULT = "https://urbanaana.com"
SUPPORT_EMAIL = "support@urbanaana.com"
INSTAGRAM_URL = "https://www.instagram.com/urbanaana.in"
FACEBOOK_URL = "https://www.facebook.com/share/18vF3ZB3BJ/"
CONTAINER_WIDTH = 470


def esc(value: object) -> str:
    return html.escape(str(value or ""))


def site_url() -> str:
    import os

    base = (
        os.environ.get("PUBLIC_WEB_URL")
        or os.environ.get("NEXT_PUBLIC_SITE_URL")
        or os.environ.get("FRONTEND_URL")
        or SITE_URL_DEFAULT
    ).rstrip("/")
    return base or SITE_URL_DEFAULT


def brand_logo_url() -> str:
    import os

    from app.config import get_settings

    override = (
        os.environ.get("EMAIL_LOGO_URL")
        or os.environ.get("BRAND_LOGO_URL")
        or ""
    ).strip()
    if override:
        return override

    # Prefer the public site (emails need a stable absolute HTTPS URL).
    # Storefront logo lives at /brand/logo.png — NOT /logo.png (404).
    site = (
        os.environ.get("PUBLIC_WEB_URL")
        or os.environ.get("NEXT_PUBLIC_SITE_URL")
        or os.environ.get("FRONTEND_URL")
        or site_url()
    ).rstrip("/")
    if site:
        return f"{site}/brand/logo.png"

    r2 = (os.environ.get("R2_PUBLIC_URL") or get_settings().r2_public_url or "").rstrip("/")
    if r2:
        return f"{r2}/brand/logo.png"
    return "https://urbanaana.com/brand/logo.png"


def _styles() -> str:
    return f"""<style type="text/css">
body {{ margin:0 !important; padding:0; height:100%; width:100%;
  -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;
  font-size:14px; font-weight:400; line-height:20px; color:{TEXT_PRIMARY};
  font-family:{FONT_STACK}; }}
img {{ border:0; height:auto; line-height:0; outline:none; text-decoration:none;
  vertical-align:top; -ms-interpolation-mode:bicubic; }}
a, a:hover, a:active, a:visited {{ color:{LINK}; text-decoration:none; }}
@media (max-width:534px) {{
  .ua-container {{ width:100% !important; max-width:none !important; margin-top:0 !important;
    border-left:0 !important; border-right:0 !important; border-radius:0 !important; }}
  .ua-pad {{ padding:20px !important; }}
  .ua-customer-col {{ display:block !important; width:100% !important; }}
}}
</style>"""


def mail_button(href: str, label: str) -> str:
    return f"""
<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 0;">
  <tr>
    <td style="border-radius:4px;background-color:{CTA_BG};">
      <a href="{esc(href)}" target="_blank"
        style="display:inline-block;padding:8px 16px;font-family:{FONT_STACK};font-size:14px;
        font-weight:400;line-height:1.41;color:#ffffff;text-decoration:none;border-radius:4px;">
        {esc(label)}
      </a>
    </td>
  </tr>
</table>"""


def mail_button_row(*buttons: tuple[str, str]) -> str:
    """Primary + optional outline buttons side by side."""
    if not buttons:
        return ""
    cells = []
    for i, (href, label) in enumerate(buttons):
        if i == 0:
            cells.append(
                f"""<td style="border-radius:4px;background-color:{CTA_BG};">
      <a href="{esc(href)}" target="_blank"
        style="display:inline-block;padding:8px 16px;font-family:{FONT_STACK};font-size:14px;
        font-weight:400;line-height:1.41;color:#ffffff;text-decoration:none;border-radius:4px;">
        {esc(label)}
      </a>
    </td>"""
            )
        else:
            cells.append(
                f"""<td style="padding-left:10px;">
      <a href="{esc(href)}" target="_blank"
        style="display:inline-block;padding:7px 15px;font-family:{FONT_STACK};font-size:14px;
        font-weight:400;line-height:1.41;color:{TEXT_PRIMARY};text-decoration:none;
        border-radius:4px;border:1px solid {BORDER};background:#fff;">
        {esc(label)}
      </a>
    </td>"""
            )
    return f"""
<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 0;">
  <tr>{"".join(cells)}</tr>
</table>"""


def support_block() -> str:
    return (
        f"Need help? Email us at "
        f'<a href="mailto:{SUPPORT_EMAIL}" style="color:{LINK};">{SUPPORT_EMAIL}</a>.'
    )


def brand_header() -> str:
    logo = brand_logo_url()
    return f"""
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:20px 24px 4px;">
      <a href="{esc(site_url())}" target="_blank" style="text-decoration:none;">
        <img src="{esc(logo)}" alt="Urban Aana" width="96"
          style="display:block;width:96px;max-width:40%;height:auto;margin:0 auto;" />
      </a>
    </td>
  </tr>
</table>"""


def section_divider() -> str:
    return f"""
<table width="100%" border="0" cellpadding="0" cellspacing="0"
  style="border-collapse:collapse;border-top:1px solid {BORDER};margin:0;">
  <tr><td style="font-size:0;line-height:0;height:0;">&nbsp;</td></tr>
</table>"""


def content_block(inner_html: str, *, top_border: bool = False) -> str:
    border = f"border-top:1px solid {BORDER};" if top_border else ""
    return f"""
<table width="100%" border="0" cellpadding="0" cellspacing="0"
  style="border-collapse:collapse;{border}">
  <tr>
    <td class="ua-pad" style="padding:20px 24px;font-family:{FONT_STACK};color:{TEXT_PRIMARY};font-size:14px;line-height:20px;">
      {inner_html}
    </td>
  </tr>
</table>"""


def format_inr(amount: float | int | str) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0.0
    return f"Rs. {value:,.2f}"


def order_item_row(
    *,
    name: str,
    qty: int,
    price: float,
    image: str = "",
    variant: str = "",
) -> str:
    img = ""
    if image:
        img = f"""
<td valign="middle" style="padding:0 16px 0 0;width:76px;">
  <img src="{esc(image)}" width="60" height="60" alt=""
    style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid {BORDER};display:block;" />
</td>"""
    variant_html = (
        f'<span style="font-size:14px;line-height:1.42;color:{TEXT_MUTED};">{esc(variant)}</span><br/>'
        if variant
        else ""
    )
    line_total = float(price or 0) * int(qty or 1)
    return f"""
<tr>
  {img}
  <td valign="top" style="padding:0;width:100%;">
    <span style="font-size:14px;line-height:1.42;color:{TEXT_PRIMARY};">{esc(name)}</span><br/>
    <span style="font-size:14px;line-height:1.42;color:{TEXT_PRIMARY};">{esc(format_inr(price))} × {int(qty or 1)}</span><br/>
    {variant_html}
  </td>
  <td valign="top" align="right" style="padding:0 0 0 16px;white-space:nowrap;">
    <span style="font-size:14px;line-height:20px;color:{TEXT_PRIMARY};">{esc(format_inr(line_total))}</span>
  </td>
</tr>
<tr><td colspan="3" style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
"""


def subtotal_row(label: str, value: str, *, muted_note: str = "", bold: bool = False) -> str:
    weight = "700" if bold else "400"
    pad_top = "16px" if bold else "2px"
    note = ""
    if muted_note:
        note = f"""
        <span style="display:block;margin-top:2px;font-size:13px;line-height:1.42;color:{TEXT_MUTED};">
          {esc(muted_note)}
        </span>"""
    return f"""
<tr>
  <td style="padding:{pad_top} 0;font-family:{FONT_STACK};font-size:14px;line-height:1.42;color:{TEXT_PRIMARY};font-weight:{weight};">
    {esc(label)}{note}
  </td>
  <td align="right" style="padding:{pad_top} 0;font-family:{FONT_STACK};font-size:14px;line-height:1.42;color:{TEXT_PRIMARY};font-weight:{weight};white-space:nowrap;">
    {esc(value)}
  </td>
</tr>"""


def info_block(title: str, body_html: str) -> str:
    return f"""
<strong style="color:{TEXT_PRIMARY};font-weight:600;">{esc(title)}</strong><br/>
<div style="margin-top:4px;color:{TEXT_PRIMARY};font-size:14px;line-height:20px;">{body_html}</div>
"""


def render_shopify_email(
    *,
    preheader: str,
    sections_html: str,
    footer_note: str = "",
) -> str:
    """Narrow bordered card layout matching Shopify staff order emails."""
    year = datetime.utcnow().year
    preview = (
        f'<span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">'
        f"{esc(preheader)}</span>"
    )
    footer = footer_note or f"© {year} Urban Aana"
    return f"""<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width" />
<title>{esc(preheader)}</title>
{_styles()}
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:{FONT_STACK};color:{TEXT_PRIMARY};">
{preview}
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffffff;">
  <tr>
    <td align="center" style="padding:0;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="height:8px;background:#c9cccf;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
      <table class="ua-container" width="{CONTAINER_WIDTH}" border="0" cellpadding="0" cellspacing="0"
        style="width:100%;max-width:{CONTAINER_WIDTH}px;border-collapse:separate;border:1px solid {BORDER};
        border-radius:8px;margin:32px auto 0;background:{BG_CARD};">
        <tr>
          <td>
            {sections_html}
          </td>
        </tr>
      </table>
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px auto 0;max-width:{CONTAINER_WIDTH}px;">
        <tr>
          <td align="center" style="padding:0 20px;font-family:{FONT_STACK};font-size:12px;line-height:20px;color:{TEXT_MUTED};">
            {esc(footer)}
          </td>
        </tr>
      </table>
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0 0;">
        <tr>
          <td style="height:8px;background:{ACCENT};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


# --- Backwards-compatible helpers used by older call sites ---

def render_email(
    *,
    title: str,
    preheader: str = "",
    subtitle: str = "",
    body_html: str,
    footer_signoff: str = "Thank you for shopping with Urban Aana.",
    logo_url: str | None = None,
) -> str:
    intro = f"<p style='margin:0 0 12px;font-size:14px;line-height:20px;'><strong>{esc(title)}</strong>"
    if subtitle:
        intro += f"<br/><span style='color:{TEXT_MUTED};'>{esc(subtitle)}</span>"
    intro += "</p>"
    sections = content_block(intro + body_html)
    return render_shopify_email(preheader=preheader or title, sections_html=sections, footer_note=footer_signoff)


def paragraph(text: str) -> str:
    return f"<p style='margin:0 0 12px;font-size:14px;line-height:20px;color:{TEXT_PRIMARY};'>{text}</p>"


def paragraph_html(html_fragment: str) -> str:
    return f"<div style='margin:0 0 12px;font-size:14px;line-height:20px;color:{TEXT_PRIMARY};'>{html_fragment}</div>"


def button(href: str, label: str) -> str:
    return mail_button(href, label)


def section_heading(label: str) -> str:
    return f"<strong style='display:block;margin:0 0 12px;font-size:16px;font-weight:600;color:{TEXT_PRIMARY};'>{esc(label)}</strong>"


def order_items_table(rows_html: str) -> str:
    return f"<table width='100%' border='0' cellpadding='0' cellspacing='0' style='border-collapse:collapse;'>{rows_html}</table>"


def order_total_row(label: str, amount: str) -> str:
    return f"""
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
  {subtotal_row(label, amount, bold=True)}
</table>"""


def build_contact_inquiry_email_html(
    *,
    name: str,
    email: str,
    phone: str = "",
    message: str = "",
) -> tuple[str, str]:
    """Staff inbox template for storefront contact form submissions."""
    safe_name = (name or "").strip() or "Customer"
    safe_email = (email or "").strip().lower()
    safe_phone = (phone or "").strip() or "—"
    safe_message = (message or "").strip() or "—"
    subject = f"Contact inquiry from {safe_name}"
    preheader = f"New message from {safe_name} via urbanaana.com"

    details = f"""
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr>
    <td style="padding:0 0 8px;font-family:{FONT_STACK};font-size:14px;line-height:20px;color:{TEXT_MUTED};width:88px;vertical-align:top;">Name</td>
    <td style="padding:0 0 8px;font-family:{FONT_STACK};font-size:14px;line-height:20px;color:{TEXT_PRIMARY};font-weight:600;">{esc(safe_name)}</td>
  </tr>
  <tr>
    <td style="padding:0 0 8px;font-family:{FONT_STACK};font-size:14px;line-height:20px;color:{TEXT_MUTED};vertical-align:top;">Email</td>
    <td style="padding:0 0 8px;font-family:{FONT_STACK};font-size:14px;line-height:20px;">
      <a href="mailto:{esc(safe_email)}" style="color:{LINK};text-decoration:none;">{esc(safe_email)}</a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 8px;font-family:{FONT_STACK};font-size:14px;line-height:20px;color:{TEXT_MUTED};vertical-align:top;">Phone</td>
    <td style="padding:0 0 8px;font-family:{FONT_STACK};font-size:14px;line-height:20px;color:{TEXT_PRIMARY};">{esc(safe_phone)}</td>
  </tr>
</table>
"""
    message_block = f"""
<div style="margin-top:4px;padding:14px 16px;border:1px solid {BORDER};border-radius:6px;background:#fafafa;">
  <div style="white-space:pre-wrap;font-family:{FONT_STACK};font-size:14px;line-height:20px;color:{TEXT_PRIMARY};">{esc(safe_message)}</div>
</div>
"""
    sections = "".join(
        [
            brand_header(),
            content_block(
                section_heading("New contact message")
                + paragraph("Someone submitted the contact form on urbanaana.com.")
                + details
            ),
            content_block(
                section_heading("Message") + message_block,
                top_border=True,
            ),
            content_block(
                paragraph_html(
                    f'Reply directly to this email, or write to '
                    f'<a href="mailto:{esc(safe_email)}" style="color:{LINK};">{esc(safe_email)}</a>.'
                )
                + mail_button(f"mailto:{safe_email}", "Reply to customer"),
                top_border=True,
            ),
        ]
    )
    html_body = render_shopify_email(
        preheader=preheader,
        sections_html=sections,
        footer_note="Urban Aana · Website contact form",
    )
    return subject, html_body
