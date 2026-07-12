"""Visitor Messages V1 integration tests."""

from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.audit_log import AuditLog
from app.models.auth import Permission, Role, RolePermission
from app.models.visitor_message import VisitorMessage


def login_and_csrf(client, username: str, password: str) -> str:
    login_response = client.post("/api/auth/login", json={"usernameOrEmail": username, "password": password})
    assert login_response.status_code == 200
    csrf_response = client.get("/api/auth/csrf")
    assert csrf_response.status_code == 200
    csrf_token = csrf_response.json()["csrfToken"]
    assert csrf_token
    return csrf_token


def create_public_message(client, nickname: str = "Visitor", message: str = "Hello", **overrides):
    payload = {"nickname": nickname, "message": message}
    payload.update(overrides)
    return client.post("/api/messages", json=payload)


def first_message(db_session: Session) -> VisitorMessage:
    return db_session.execute(select(VisitorMessage).order_by(VisitorMessage.id)).scalars().first()


def audit_actions(db_session: Session) -> list[str]:
    return list(db_session.execute(select(AuditLog.action).order_by(AuditLog.id)).scalars())


def admin_headers(client, username: str = "admin", password: str = "adminpass") -> dict[str, str]:
    return {"X-CSRF-Token": login_and_csrf(client, username, password)}


def test_valid_public_create_returns_201_generic_response_and_no_id(client, db_session: Session):
    response = create_public_message(client, contact="visitor@example.test")

    assert response.status_code == 201
    assert response.json() == {"accepted": True}
    stored = first_message(db_session)
    assert stored is not None
    assert stored.nickname == "Visitor"
    assert stored.contact == "visitor@example.test"


def test_contact_is_optional(client, db_session: Session):
    response = create_public_message(client)

    assert response.status_code == 201
    assert first_message(db_session).contact is None


@pytest.mark.parametrize(
    ("payload", "expected_field"),
    [
        ({"message": "Missing nickname"}, "nickname"),
        ({"nickname": "x" * 81, "message": "Too long nickname"}, "nickname"),
        ({"nickname": "Visitor"}, "message"),
        ({"nickname": "Visitor", "message": "x" * 2001}, "message"),
        ({"nickname": "Visitor", "message": "Hello", "contact": "x" * 121}, "contact"),
    ],
)
def test_public_field_required_and_length_contract(client, payload, expected_field):
    response = client.post("/api/messages", json=payload)

    assert response.status_code == 422
    assert expected_field in response.text


@pytest.mark.parametrize(
    "field",
    [
        "data_scope",
        "dataScope",
        "status",
        "is_highlighted",
        "isHighlighted",
        "highlighted_at",
        "highlightedAt",
        "admin_note",
        "adminNote",
        "source_app",
        "sourceApp",
        "deleted_at",
        "deletedAt",
        "deleted_by",
        "deletedBy",
        "delete_reason",
        "deleteReason",
        "id",
        "created_at",
        "createdAt",
        "updated_at",
        "updatedAt",
        "submitter_fingerprint",
        "submitterFingerprint",
        "actor_id",
        "actorUserId",
    ],
)
def test_public_forbidden_management_fields_return_422(client, field):
    response = create_public_message(client, **{field: "forbidden"})

    assert response.status_code == 422
    assert field in response.text


def test_honeypot_returns_201_and_inserts_no_row(client, db_session: Session):
    response = create_public_message(client, nickname="Bot", message="Ignore me", website="https://spam.example.test")

    assert response.status_code == 201
    assert response.json() == {"accepted": True}
    assert db_session.execute(select(VisitorMessage)).scalars().all() == []


def test_rate_limit_returns_429(client):
    for index in range(5):
        assert create_public_message(client, nickname=f"Visitor {index}").status_code == 201

    limited_response = create_public_message(client, nickname="Visitor 6")

    assert limited_response.status_code == 429
    assert limited_response.headers.get("Retry-After") == "600"


def test_non_production_environment_forces_test_scope(client, db_session: Session):
    response = create_public_message(client, data_scope="production")

    assert response.status_code == 422
    response = create_public_message(client, nickname="Scope Visitor")
    assert response.status_code == 201
    assert first_message(db_session).data_scope == "test"


def test_production_environment_forces_production_scope(client, db_session: Session, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("ALLOW_DEV_TOOLS", "false")
    monkeypatch.setenv("SESSION_SECRET", "production-test-secret")
    get_settings.cache_clear()

    response = create_public_message(client, nickname="Production Visitor")

    assert response.status_code == 201
    assert first_message(db_session).data_scope == "production"
    monkeypatch.setenv("APP_ENV", "test")
    get_settings.cache_clear()


def test_raw_ip_is_not_stored_and_fingerprint_not_public(client, db_session: Session):
    response = create_public_message(client)

    assert response.status_code == 201
    assert "submitterFingerprint" not in response.json()
    stored = first_message(db_session)
    assert stored.submitter_fingerprint
    assert stored.submitter_fingerprint != "testclient"
    assert not hasattr(stored, "raw_ip")
    assert not hasattr(stored, "ip_address")


def test_admin_list_authorization_guest_user_and_admin(client, normal_user, admin_user):
    assert client.get("/api/admin/messages").status_code == 401

    login_and_csrf(client, "user", "userpass")
    assert client.get("/api/admin/messages").status_code == 403

    login_and_csrf(client, "admin", "adminpass")
    assert client.get("/api/admin/messages").status_code == 200


def test_admin_detail_authorization_guest_user_and_admin(client, normal_user, admin_user):
    create_public_message(client)
    message_id = 1

    assert client.get(f"/api/admin/messages/{message_id}").status_code == 401

    login_and_csrf(client, "user", "userpass")
    assert client.get(f"/api/admin/messages/{message_id}").status_code == 403

    login_and_csrf(client, "admin", "adminpass")
    assert client.get(f"/api/admin/messages/{message_id}").status_code == 200


def test_admin_mutation_authorization_and_csrf(client, normal_user, admin_user):
    create_public_message(client)
    message_id = 1

    assert client.patch(f"/api/admin/messages/{message_id}", json={"status": "read"}).status_code == 401

    login_and_csrf(client, "user", "userpass")
    assert client.patch(f"/api/admin/messages/{message_id}", json={"status": "read"}).status_code == 403

    login_and_csrf(client, "admin", "adminpass")
    assert client.patch(f"/api/admin/messages/{message_id}", json={"status": "read"}).status_code == 403

    csrf_headers = {"X-CSRF-Token": client.get("/api/auth/csrf").json()["csrfToken"]}
    assert client.patch(f"/api/admin/messages/{message_id}", json={"status": "read"}, headers=csrf_headers).status_code == 200


def test_delete_and_restore_require_admin_permission_and_csrf(client, normal_user, admin_user):
    create_public_message(client)
    message_id = 1

    assert client.delete(f"/api/admin/messages/{message_id}").status_code == 401

    login_and_csrf(client, "user", "userpass")
    assert client.delete(f"/api/admin/messages/{message_id}").status_code == 403

    login_and_csrf(client, "admin", "adminpass")
    assert client.delete(f"/api/admin/messages/{message_id}").status_code == 403

    csrf = client.get("/api/auth/csrf").json()["csrfToken"]
    headers = {"X-CSRF-Token": csrf}
    assert client.delete(f"/api/admin/messages/{message_id}", headers=headers).status_code == 200

    assert client.post(f"/api/admin/messages/{message_id}/restore").status_code == 403
    csrf = client.get("/api/auth/csrf").json()["csrfToken"]
    assert client.post(f"/api/admin/messages/{message_id}/restore", headers={"X-CSRF-Token": csrf}).status_code == 200


def test_admin_permission_is_required_in_addition_to_admin_role(client, db_session: Session, admin_user):
    permission = db_session.execute(
        select(Permission).where(Permission.permission_key == "visitor_messages:read")
    ).scalar_one()
    role = db_session.execute(select(Role).where(Role.role_key == "admin")).scalar_one()
    db_session.execute(
        RolePermission.__table__.delete().where(
            RolePermission.role_id == role.id,
            RolePermission.permission_id == permission.id,
        )
    )
    db_session.commit()
    login_and_csrf(client, "admin", "adminpass")

    assert client.get("/api/admin/messages").status_code == 403


def test_default_list_excludes_deleted_and_include_deleted_returns_deleted(client, admin_user):
    create_public_message(client, nickname="Active")
    create_public_message(client, nickname="Deleted")
    headers = admin_headers(client)
    client.delete("/api/admin/messages/2", headers=headers)

    default_items = client.get("/api/admin/messages").json()["items"]
    include_deleted_items = client.get("/api/admin/messages?include_deleted=true").json()["items"]

    assert [item["nickname"] for item in default_items] == ["Active"]
    assert {item["nickname"] for item in include_deleted_items} == {"Active", "Deleted"}
    assert any(item["deletedAt"] for item in include_deleted_items)


def test_status_highlight_search_and_pagination_filters_work(client, admin_user):
    create_public_message(client, nickname="Alpha", message="needle one")
    create_public_message(client, nickname="Beta", message="other text")
    create_public_message(client, nickname="Gamma", message="needle two")
    headers = admin_headers(client)
    client.patch("/api/admin/messages/2", json={"status": "read", "isHighlighted": True}, headers=headers)

    assert client.get("/api/admin/messages?status=read").json()["items"][0]["nickname"] == "Beta"
    assert client.get("/api/admin/messages?highlighted=true").json()["items"][0]["nickname"] == "Beta"
    assert {item["nickname"] for item in client.get("/api/admin/messages?search=needle").json()["items"]} == {
        "Alpha",
        "Gamma",
    }
    page = client.get("/api/admin/messages?limit=1&offset=1").json()
    assert page["limit"] == 1
    assert page["offset"] == 1
    assert len(page["items"]) == 1


def test_summary_counts_are_correct(client, admin_user):
    create_public_message(client, nickname="One")
    create_public_message(client, nickname="Two")
    create_public_message(client, nickname="Three")
    headers = admin_headers(client)
    client.patch("/api/admin/messages/1", json={"status": "read", "isHighlighted": True}, headers=headers)
    client.patch("/api/admin/messages/2", json={"status": "archived"}, headers=headers)
    client.delete("/api/admin/messages/3", headers=headers)

    summary = client.get("/api/admin/messages/summary").json()

    assert summary == {
        "total": 3,
        "active": 2,
        "deleted": 1,
        "new": 0,
        "read": 1,
        "archived": 1,
        "highlighted": 1,
    }


def test_highlighting_sets_and_clears_highlighted_at(client, admin_user):
    create_public_message(client)
    headers = admin_headers(client)

    highlighted = client.patch("/api/admin/messages/1", json={"isHighlighted": True}, headers=headers).json()
    assert highlighted["isHighlighted"] is True
    assert highlighted["highlightedAt"]

    unhighlighted = client.patch("/api/admin/messages/1", json={"isHighlighted": False}, headers=headers).json()
    assert unhighlighted["isHighlighted"] is False
    assert unhighlighted["highlightedAt"] is None


def test_status_and_admin_note_updates_persist(client, admin_user):
    create_public_message(client)
    headers = admin_headers(client)

    patched = client.patch(
        "/api/admin/messages/1",
        json={"status": "read", "adminNote": "Reviewed"},
        headers=headers,
    ).json()

    assert patched["status"] == "read"
    assert patched["adminNote"] == "Reviewed"


def test_soft_delete_populates_deletion_metadata(client, admin_user):
    create_public_message(client)
    headers = admin_headers(client)

    deleted = client.request(
        "DELETE",
        "/api/admin/messages/1",
        json={"reason": "Resolved"},
        headers=headers,
    ).json()

    assert deleted["deletedAt"]
    assert deleted["deletedBy"] == "user:1"
    assert deleted["deleteReason"] == "Resolved"


def test_deleted_message_patch_returns_409_without_mutation_or_audit(client, admin_user, db_session: Session):
    create_public_message(client)
    headers = admin_headers(client)
    client.delete("/api/admin/messages/1", headers=headers)
    stored_before = db_session.get(VisitorMessage, 1)
    old_updated_at = stored_before.updated_at
    old_status = stored_before.status
    old_action_count = len(audit_actions(db_session))

    response = client.patch("/api/admin/messages/1", json={"status": "read"}, headers=headers)
    db_session.refresh(stored_before)

    assert response.status_code == 409
    assert stored_before.status == old_status
    assert stored_before.updated_at == old_updated_at
    assert len(audit_actions(db_session)) == old_action_count


def test_restore_deleted_message_succeeds_and_preserves_content(client, admin_user):
    create_public_message(client, nickname="Restore Me", contact="r@example.test", message="Keep content")
    headers = admin_headers(client)
    client.patch("/api/admin/messages/1", json={"status": "read", "isHighlighted": True}, headers=headers)
    before_delete = client.get("/api/admin/messages/1").json()
    client.delete("/api/admin/messages/1", headers=headers)

    restored = client.post("/api/admin/messages/1/restore", headers=headers).json()

    assert restored["deletedAt"] is None
    assert restored["deletedBy"] is None
    assert restored["deleteReason"] is None
    assert restored["createdAt"] == before_delete["createdAt"]
    assert restored["status"] == "read"
    assert restored["isHighlighted"] is True
    assert restored["nickname"] == "Restore Me"
    assert restored["contact"] == "r@example.test"
    assert restored["message"] == "Keep content"


def test_restoring_active_message_returns_409_without_audit(client, admin_user, db_session: Session):
    create_public_message(client)
    headers = admin_headers(client)
    old_action_count = len(audit_actions(db_session))
    before = client.get("/api/admin/messages/1").json()

    response = client.post("/api/admin/messages/1/restore", headers=headers)
    after = client.get("/api/admin/messages/1").json()

    assert response.status_code == 409
    assert before == after
    assert len(audit_actions(db_session)) == old_action_count


def test_missing_update_and_restore_return_404(client, admin_user):
    headers = admin_headers(client)

    assert client.patch("/api/admin/messages/404", json={"status": "read"}, headers=headers).status_code == 404
    assert client.post("/api/admin/messages/404/restore", headers=headers).status_code == 404


def test_specific_audit_actions_are_written_for_changed_fields(client, admin_user, db_session: Session):
    create_public_message(client)
    headers = admin_headers(client)

    client.patch(
        "/api/admin/messages/1",
        json={"status": "read", "isHighlighted": True, "adminNote": "Reviewed"},
        headers=headers,
    )

    actions = audit_actions(db_session)
    assert "visitor_message.status_update" in actions
    assert "visitor_message.highlight_update" in actions
    assert "visitor_message.admin_note_update" in actions
    assert "visitor_message.admin_update" not in actions


def test_admin_audit_summaries_do_not_include_visitor_content(client, admin_user, db_session: Session):
    create_public_message(
        client,
        nickname="Private Nickname",
        contact="private@example.test",
        message="Private message body",
    )
    headers = admin_headers(client)

    client.patch(
        "/api/admin/messages/1",
        json={"status": "read", "isHighlighted": True, "adminNote": "Private admin note"},
        headers=headers,
    )

    summaries = db_session.execute(select(AuditLog.summary).order_by(AuditLog.id)).scalars().all()
    combined_summaries = " ".join(summary or "" for summary in summaries)
    assert "Private Nickname" not in combined_summaries
    assert "private@example.test" not in combined_summaries
    assert "Private message body" not in combined_summaries
    assert "Private admin note" not in combined_summaries
    assert "fingerprint" not in combined_summaries.lower()


def test_unchanged_values_do_not_create_false_audit_actions(client, admin_user, db_session: Session):
    create_public_message(client)
    headers = admin_headers(client)
    client.patch("/api/admin/messages/1", json={"status": "read"}, headers=headers)
    action_count = len(audit_actions(db_session))

    response = client.patch("/api/admin/messages/1", json={"status": "read"}, headers=headers)

    assert response.status_code == 200
    assert len(audit_actions(db_session)) == action_count


def test_fingerprint_absent_from_admin_responses(client, admin_user):
    create_public_message(client)
    headers = admin_headers(client)

    list_item = client.get("/api/admin/messages").json()["items"][0]
    detail = client.get("/api/admin/messages/1").json()
    updated = client.patch("/api/admin/messages/1", json={"status": "read"}, headers=headers).json()

    assert "submitterFingerprint" not in list_item
    assert "submitterFingerprint" not in detail
    assert "submitterFingerprint" not in updated


def test_html_script_like_content_remains_json_text(client, admin_user):
    text = "<script>alert('x')</script><b>hello</b>"
    response = create_public_message(client, message=text)
    assert response.status_code == 201
    headers = admin_headers(client)

    detail = client.get("/api/admin/messages/1", headers=headers).json()

    assert detail["message"] == text
