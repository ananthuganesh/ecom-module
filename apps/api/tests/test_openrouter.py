import base64

from app.services.openrouter import (
    build_user_content,
    extract_image_from_response,
    save_ai_image,
)


def test_extract_from_images_field():
    png = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode("ascii")
    payload = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "done",
                    "images": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{png}"},
                        }
                    ],
                }
            }
        ]
    }
    raw, ext = extract_image_from_response(payload)
    assert ext == ".png"
    assert raw.startswith(b"\x89PNG")


def test_extract_missing_raises():
    try:
        extract_image_from_response({"choices": [{"message": {"content": "no image"}}]})
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "No image" in str(exc)


def test_build_user_content_order():
    content = build_user_content("hello", ["data:image/png;base64,aaa", "data:image/jpeg;base64,bbb"])
    assert content[0] == {"type": "text", "text": "hello"}
    assert content[1]["image_url"]["url"].startswith("data:image/png")
    assert len(content) == 3


def test_save_ai_image(tmp_path, monkeypatch):
    from app.services import openrouter as mod

    monkeypatch.setattr(mod, "AI_UPLOAD_DIR", tmp_path)
    url = save_ai_image(b"hello-bytes", ".png")
    assert url.startswith("/uploads/ai/")
    name = url.rsplit("/", 1)[-1]
    assert (tmp_path / name).read_bytes() == b"hello-bytes"
