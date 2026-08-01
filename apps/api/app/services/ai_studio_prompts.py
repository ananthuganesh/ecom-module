"""AI Studio prompts from environment only."""

from __future__ import annotations

from app.config import get_settings

DEFAULT_STYLE_PROMPT = (
    "First image is the style/scene reference. Match its lighting, background, and mood."
)
DEFAULT_PRODUCT_PROMPT = (
    "Second image is the t-shirt front. Third image is the t-shirt back. "
    "Generate a polished product photo while keeping the garment print, color, and fit accurate."
)


def studio_prompt_defaults() -> dict[str, str]:
    settings = get_settings()
    style = str(settings.ai_studio_style_prompt or "").strip() or DEFAULT_STYLE_PROMPT
    product = str(settings.ai_studio_prompt or "").strip() or DEFAULT_PRODUCT_PROMPT
    return {"stylePrompt": style, "prompt": product}


def compose_studio_prompt() -> str:
    """Build the generation prompt from AI_STUDIO_* env (or code defaults)."""
    defaults = studio_prompt_defaults()
    return f"{defaults['stylePrompt']}\n\n{defaults['prompt']}".strip()
