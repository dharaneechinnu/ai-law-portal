"""First-run setup, invite activation and admin-only areas."""
import uuid

from conftest import auth, headers


def test_setup_only_once(client, admin):
    r = client.post("/api/auth/setup", json={"firm_name": "Again", "name": "X", "email": "x@test.firm", "password": "Admin@12345"})
    assert r.status_code == 409


def test_invite_link_activates_once(client, admin):
    email = f"invitee.{uuid.uuid4().hex[:6]}@test.firm"
    created = client.post("/api/admin/users", headers=headers(admin), json={"name": "Invitee", "email": email, "role": "paralegal"}).json()
    token = created["invite_token"]
    assert token and created["user"]["status"] == "invited"

    info = client.get(f"/api/auth/invite/{token}").json()
    assert info["email"] == email and info["firm_name"] == "Test Firm"

    assert client.post("/api/auth/accept-invite", json={"token": token, "password": "short"}).status_code in (400, 422)
    r = client.post("/api/auth/accept-invite", json={"token": token, "password": "Str0ng!pass", "name": "Invited Person"})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Invited Person"
    assert auth(client, email, "Str0ng!pass")  # can sign in with the new password

    # the link works once
    assert client.get(f"/api/auth/invite/{token}").status_code == 404
    assert client.post("/api/auth/accept-invite", json={"token": token, "password": "Str0ng!pass2"}).status_code == 404


def test_bad_or_disabled_access(client, admin, make_user):
    assert client.get("/api/auth/invite/not-a-real-token").status_code == 404
    user = make_user("associate")
    client.patch(f"/api/admin/users/{user['id']}", headers=headers(admin), json={"is_active": False})
    assert client.post("/api/auth/login", json={"email": user["email"], "password": "Passw0rd!x"}).status_code in (401, 403)
    assert client.get("/api/admin/users", headers=headers(make_user("partner"))).status_code == 403
    assert client.get("/api/settings/email", headers=headers(make_user("lawyer"))).status_code == 403


def test_only_admin_can_configure_ai_and_integrations(client, admin, make_user):
    for role in ("partner", "lawyer", "associate", "paralegal"):
        h = headers(make_user(role))
        assert client.get("/api/settings/ai", headers=h).status_code == 403, role
        assert client.put("/api/settings/ai", headers=h, json={"chat": {"kind": "openai", "fields": {}, "model": "m"},
                                                                "embedding": {"same_as_chat": True, "model": "e"}}).status_code == 403, role
        assert client.post("/api/settings/ai/test", headers=h).status_code == 403, role
        assert client.get("/api/settings/ai/routes", headers=h).status_code == 403, role
        assert client.get("/api/settings/legal", headers=h).status_code == 403, role
        assert client.get("/api/settings/firm", headers=h).status_code == 403, role
        assert client.get("/api/agents/controls", headers=h).status_code == 403, role
    assert client.get("/api/settings/ai", headers=headers(admin)).status_code == 200


def test_login_uses_httponly_session_cookie(client, admin):
    r = client.post("/api/auth/login", json={"email": "admin@test.firm", "password": "Admin@12345"})
    assert r.status_code == 200 and "access_token" not in r.json()
    cookie = r.headers["set-cookie"].lower()
    assert cookie.startswith("session=") and "httponly" in cookie and "samesite=lax" in cookie and "max-age" not in cookie
    try:
        assert client.get("/api/auth/me").json()["email"] == "admin@test.firm"  # cookie alone authenticates
        assert client.post("/api/auth/logout").status_code == 204
        assert client.get("/api/auth/me").status_code == 401
    finally:
        client.cookies.clear()
