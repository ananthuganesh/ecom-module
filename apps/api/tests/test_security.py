from app.security import create_access_token, decode_token, hash_password, verify_password


def test_bcrypt_roundtrip():
    hashed = hash_password("correct-horse")
    assert hashed.startswith("$2")
    assert verify_password("correct-horse", hashed)
    assert not verify_password("wrong", hashed)


def test_rejects_plaintext_stored_password():
    assert not verify_password("secret", "secret")
    assert not verify_password("secret", None)


def test_jwt_roundtrip():
    token = create_access_token("507f1f77bcf86cd799439011", hours=2)
    payload = decode_token(token)
    assert payload["id"] == "507f1f77bcf86cd799439011"
    assert "exp" in payload
