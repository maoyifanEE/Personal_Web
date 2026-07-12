"""Visitor Messages V1 integration tests."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.visitor_message import VisitorMessage


def login_and_csrf(client, username: str, password: str) -> str:
    login_response = client.post("/api/auth/login", json={"usernameOrEmail": username, "password": password})
    assert login_response.status_code == 200
    csrf_response = client.get("/api/auth/csrf")
    assert csrf_response.status_code == 200
    csrf_token = csrf_response.json()["csrfToken"]
    assert csrf_token
    return csrf_token


def test_public_message_create_returns_generic_accepted_and_persists(client, db_session: Session):
    response = client.post(
        "/api/messages",
        json={
            "nickname": "Visitor",
            "contact": "visitor@example.test",
            "message": "Hello from a public visitor.",
        },
    )

    assert response.status_code == 202
    assert response.json() == {"accepted": True}
    message = db_session.execute(select(VisitorMessage)).scalar_one()
    assert message.nickname == "Visitor"
    assert message.contact == "visitor@example.test"
    assert message.submitter_fingerprint
    assert message.submitter_fingerprint != "testclient"


def test_public_message_honeypot_is_accepted_without_persistence(client, db_session: Session):
    response = client.post(
        "/api/messages",
        json={
            "nickname": "Bot",
            "message": "Should not persist.",
            "website": "https://spam.example.test",
        },
    )

    assert response.status_code == 202
    assert response.json() == {"accepted": True}
    assert db_session.execute(select(VisitorMessage)).scalars().all() == []


def test_public_message_rate_limit_uses_fingerprint(client):
    for index in range(5):
        response = client.post("/api/messages", json={"nickname": f"Visitor {index}", "message": "Hello"})
        assert response.status_code == 202

    limited_response = client.post("/api/messages", json={"nickname": "Visitor 6", "message": "Hello"})

    assert limited_response.status_code == 429
    assert limited_response.headers.get("Retry-After") == "600"


def test_admin_message_routes_require_authentication(client):
    response = client.get("/api/admin/messages")

    assert response.status_code == 401


def test_non_admin_cannot_read_admin_messages(client, normal_user):
    login_and_csrf(client, "user", "userpass")

    response = client.get("/api/admin/messages")

    assert response.status_code == 403


def test_admin_can_list_update_soft_delete_and_restore_messages(client, admin_user, db_session: Session):
    client.post("/api/messages", json={"nickname": "Visitor", "message": "Manage me"})
    csrf_token = login_and_csrf(client, "admin", "adminpass")

    list_response = client.get("/api/admin/messages")
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert len(items) == 1
    message_id = items[0]["id"]
    assert "submitterFingerprint" not in items[0]

    no_csrf_response = client.patch(f"/api/admin/messages/{message_id}", json={"status": "read"})
    assert no_csrf_response.status_code == 403

    patch_response = client.patch(
        f"/api/admin/messages/{message_id}",
        json={"status": "read", "isHighlighted": True, "adminNote": "Reviewed"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["status"] == "read"
    assert patched["isHighlighted"] is True
    assert patched["adminNote"] == "Reviewed"

    delete_response = client.request(
        "DELETE",
        f"/api/admin/messages/{message_id}",
        json={"reason": "No longer needed"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deletedAt"]

    restore_response = client.post(
        f"/api/admin/messages/{message_id}/restore",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["deletedAt"] is None

    stored = db_session.get(VisitorMessage, message_id)
    assert stored is not None
    assert stored.deleted_at is None
