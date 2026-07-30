from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.core.security import require_admin, require_auth
from app.services import audit_log, session_store, users_store

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class NewUserRequest(BaseModel):
    email: str
    password: str
    role: str = "viewer"


@router.post("/login")
def login(body: LoginRequest) -> dict:
    email = body.email.strip().lower()
    if not users_store.verify_login(email, body.password):
        audit_log.log_event(email, "login_failed")
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    role = users_store.get_role(email) or "viewer"
    token = session_store.create_session(email, role)
    audit_log.log_event(email, "login")
    return {"email": email, "role": role, "token": token}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)) -> dict:
    if authorization and authorization.startswith("Bearer "):
        session_store.delete_session(authorization.removeprefix("Bearer ").strip())
    return {"ok": True}


@router.get("/me")
def me(session: dict = Depends(require_auth)) -> dict:
    return {"email": session["email"], "role": session["role"]}


@router.get("/users")
def get_users(_admin: dict = Depends(require_admin)) -> dict:
    return {"users": users_store.list_users()}


@router.post("/users")
def create_user(body: NewUserRequest, admin: dict = Depends(require_admin)) -> dict:
    try:
        users_store.add_user(body.email, body.password, body.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    audit_log.log_event(admin["email"], "user_added", f"{body.email.strip().lower()} (role={body.role})")
    return {"users": users_store.list_users()}


@router.delete("/users/{email}")
def remove_user(email: str, admin: dict = Depends(require_admin)) -> dict:
    try:
        users_store.delete_user(email)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    audit_log.log_event(admin["email"], "user_removed", email.strip().lower())
    return {"users": users_store.list_users()}
