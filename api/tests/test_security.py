from app.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


class TestPasswordHashing:
    def test_should_verify_when_password_matches_hash(self):
        hashed = hash_password("correct-horse-battery-staple")

        assert verify_password("correct-horse-battery-staple", hashed) is True

    def test_should_not_verify_when_password_does_not_match_hash(self):
        hashed = hash_password("correct-horse-battery-staple")

        assert verify_password("wrong-password", hashed) is False

    def test_should_produce_different_hashes_for_the_same_password(self):
        # argon2 salts each hash, so re-hashing the same password must differ.
        first = hash_password("correct-horse-battery-staple")
        second = hash_password("correct-horse-battery-staple")

        assert first != second


class TestSessionTokens:
    def test_should_generate_unique_tokens(self):
        assert generate_session_token() != generate_session_token()

    def test_should_hash_deterministically(self):
        token = generate_session_token()

        assert hash_session_token(token) == hash_session_token(token)

    def test_should_produce_different_hashes_for_different_tokens(self):
        assert hash_session_token(generate_session_token()) != hash_session_token(
            generate_session_token()
        )
