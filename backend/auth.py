"""
Auth module — Simple session-based authentication.
In-memory session store (good enough for hackathon demo).
"""

import uuid

# In-memory session store: { "session_token": user_id }
SESSION_STORE = {}


def create_session(user_id: int) -> str:
    """Create a new session for a user and return the token."""
    token = str(uuid.uuid4())
    SESSION_STORE[token] = user_id
    return token


def get_user_from_token(token: str):
    """Get user_id from a session token. Returns None if invalid."""
    return SESSION_STORE.get(token)


def delete_session(token: str):
    """Delete a session (logout)."""
    SESSION_STORE.pop(token, None)


def extract_token(authorization: str) -> str:
    """Extract token from 'Bearer <token>' header value."""
    if not authorization:
        return None
    if authorization.startswith("Bearer "):
        return authorization[7:]
    return authorization
