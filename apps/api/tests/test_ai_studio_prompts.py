from app.services.ai_studio_prompts import compose_studio_prompt, studio_prompt_defaults


def test_compose_studio_prompt_has_defaults():
    defaults = studio_prompt_defaults()
    assert defaults["stylePrompt"]
    assert defaults["prompt"]
    combined = compose_studio_prompt()
    assert defaults["stylePrompt"] in combined
    assert defaults["prompt"] in combined
