import hashlib
import secrets
import csv
import io
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db, engine
import models

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SGRA - Sistema de Gestión de Reposición de Almacén")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

STATUS_TRANSITIONS = {
    models.RequestStatus.REPORTED: models.RequestStatus.ORDERED,
    models.RequestStatus.ORDERED: models.RequestStatus.RECEIVED,
}


def seed_initial_data(db: Session):
    if db.query(models.User).count() > 0:
        return

    users = [
        ("juan", "almacen123", "Juan Pérez", "admin"),
        ("admin", "admin123", "Administrador", "admin"),
    ]
    for username, password, name, role in users:
        h = hashlib.sha256(password.encode()).hexdigest()
        db.add(models.User(username=username, password_hash=h, name=name, role=role))

    products = [
        ("G-001", "Caja de 10 guantes talla L", "Equipo protección"),
        ("G-002", "Caja de 100 bolsas plásticas 40x60", "Empaque"),
        ("G-003", "Rollo de film stretch 500mm", "Empaque"),
        ("G-004", "Cinta adhesiva transparente 48mm", "Empaque"),
        ("G-005", "Etiqueta térmica 100x150mm", "Etiquetado"),
        ("G-006", "Caja de cartón 40x30x20", "Embalaje"),
        ("G-007", "Fleje plástico 12mm", "Embalaje"),
        ("G-008", "Marcador indeleble punta gruesa", "Oficina"),
        ("G-009", "Cinta de embalaje 50mm", "Empaque"),
        ("G-010", "Rollo de burbuja 50cm x 100m", "Empaque"),
        ("G-011", "Zuncho metálico 16mm", "Embalaje"),
        ("G-012", "Esquinero de cartón", "Embalaje"),
    ]
    for code, name, category in products:
        db.add(models.Product(code=code, name=name, category=category))

    db.commit()


@app.on_event("startup")
def startup():
    db = next(get_db())
    try:
        seed_initial_data(db)
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token_str = credentials.credentials
    token = db.query(models.Token).filter(models.Token.token == token_str).first()
    if not token:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = db.query(models.User).filter(models.User.id == token.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


# ---------- AUTH ----------


@app.post("/api/login")
def login(data: dict, db: Session = Depends(get_db)):
    username = data.get("username", "")
    password = data.get("password", "")
    h = hashlib.sha256(password.encode()).hexdigest()
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or user.password_hash != h:
        raise HTTPException(status_code=400, detail="Credenciales inválidas")
    token_str = secrets.token_hex(32)
    token = models.Token(token=token_str, user_id=user.id)
    db.add(token)
    db.commit()
    return {
        "token": token_str,
        "user": {"id": user.id, "name": user.name, "username": user.username, "role": user.role},
    }


@app.post("/api/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    db.query(models.Token).filter(models.Token.token == credentials.credentials).delete()
    db.commit()
    return {"ok": True}


@app.get("/api/me")
def get_me(user=Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "username": user.username, "role": user.role}


# ---------- REQUESTS ----------


@app.get("/api/requests")
def list_requests(user=Depends(get_current_user), db: Session = Depends(get_db)):
    q = (
        db.query(models.Request)
        .filter(models.Request.status != models.RequestStatus.RECEIVED)
        .order_by(models.Request.created_at.desc())
        .all()
    )
    result = []
    for r in q:
        now = datetime.now()
        hours_elapsed = (now - r.created_at).total_seconds() / 3600
        requires_attention = r.status == models.RequestStatus.REPORTED and hours_elapsed >= 24
        requires_attention = requires_attention or (r.status == models.RequestStatus.ORDERED and hours_elapsed >= 48)
        result.append(
            {
                "id": r.id,
                "product_id": r.product_id,
                "product_code": r.product.code if r.product else "",
                "product_name": r.product.name if r.product else "Desconocido",
                "product_category": r.product.category if r.product else "",
                "quantity": r.quantity,
                "note": r.note or "",
                "status": r.status,
                "requested_by": r.requested_by,
                "requester_name": r.requester.name if r.requester else "Desconocido",
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
                "hours_elapsed": round(hours_elapsed, 1),
                "requires_attention": requires_attention,
            }
        )
    return result


@app.get("/api/requests/history")
def list_history(user=Depends(get_current_user), db: Session = Depends(get_db)):
    q = (
        db.query(models.Request)
        .filter(models.Request.status == models.RequestStatus.RECEIVED)
        .order_by(models.Request.completed_at.desc())
        .limit(100)
        .all()
    )
    result = []
    for r in q:
        result.append(
            {
                "id": r.id,
                "product_code": r.product.code if r.product else "",
                "product_name": r.product.name if r.product else "Desconocido",
                "quantity": r.quantity,
                "requester_name": r.requester.name if r.requester else "Desconocido",
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "completed_at": r.completed_at.isoformat() if r.completed_at else "",
            }
        )
    return result


@app.post("/api/requests")
def create_request(data: dict, user=Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == data["product_id"]).first()
    if not product:
        raise HTTPException(status_code=400, detail="Producto no encontrado")
    r = models.Request(
        product_id=data["product_id"],
        quantity=data.get("quantity", 1),
        note=data.get("note", ""),
        requested_by=user.id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "status": r.status, "product_name": product.name}


@app.put("/api/requests/{request_id}/status")
def update_status(
    request_id: int,
    data: dict,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = db.query(models.Request).filter(models.Request.id == request_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    new_status = data.get("status", "")
    allowed = STATUS_TRANSITIONS.get(r.status, None)
    if allowed and new_status == allowed:
        r.status = new_status
        r.updated_at = datetime.now()
        if new_status == models.RequestStatus.RECEIVED:
            r.completed_at = datetime.now()
        db.commit()
        return {"id": r.id, "status": r.status}
    raise HTTPException(
        status_code=400,
        detail=f"No se puede cambiar de '{r.status}' a '{new_status}'",
    )


@app.delete("/api/requests/{request_id}")
def delete_request(
    request_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = db.query(models.Request).filter(models.Request.id == request_id).first()
    if not r:
        raise HTTPException(status_code=404)
    if user.role != "admin" and r.requested_by != user.id:
        raise HTTPException(status_code=403, detail="Sin permiso")
    db.delete(r)
    db.commit()
    return {"ok": True}


# ---------- PRODUCTS ----------


@app.get("/api/products")
def list_products(user=Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(models.Product).order_by(models.Product.category, models.Product.code).all()
    return [{"id": p.id, "code": p.code or "", "name": p.name, "category": p.category} for p in q]


@app.get("/api/products/search")
def search_products(q: str = "", user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not q or len(q) < 1:
        return []
    search = f"%{q}%"
    results = (
        db.query(models.Product)
        .filter(or_(models.Product.code.ilike(search), models.Product.name.ilike(search)))
        .limit(20)
        .all()
    )
    return [{"id": p.id, "code": p.code or "", "name": p.name, "category": p.category} for p in results]


@app.get("/api/products/categories")
def list_categories(user=Depends(get_current_user), db: Session = Depends(get_db)):
    cats = db.query(models.Product.category).distinct().all()
    return sorted([c[0] for c in cats if c[0]])


@app.post("/api/products")
def create_product(data: dict, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    p = models.Product(code=data.get("code", ""), name=data["name"], category=data.get("category", "General"))
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "code": p.code, "name": p.name, "category": p.category}


@app.post("/api/products/import")
def import_products(data: dict, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    items = data.get("products", [])
    count = 0
    for item in items:
        code = item.get("code", "").strip()
        name = item.get("name", "").strip()
        category = item.get("category", "General").strip()
        if not name:
            continue
        existing = None
        if code:
            existing = db.query(models.Product).filter(models.Product.code == code).first()
        if not existing:
            existing = db.query(models.Product).filter(models.Product.name == name).first()
        if existing:
            existing.code = code or existing.code
            existing.name = name
            existing.category = category
        else:
            db.add(models.Product(code=code, name=name, category=category))
        count += 1
    db.commit()
    return {"imported": count}


@app.delete("/api/products/{product_id}")
def delete_product(
    product_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    p = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404)
    db.delete(p)
    db.commit()
    return {"ok": True}


# ---------- USERS ----------


@app.get("/api/users")
def list_users(user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    q = db.query(models.User).all()
    return [{"id": u.id, "name": u.name, "username": u.username, "role": u.role} for u in q]


@app.post("/api/users")
def create_user(data: dict, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    username = data.get("username", "").strip()
    password = data.get("password", "")
    name = data.get("name", "").strip()
    role = data.get("role", "worker")
    if not username or not password or not name:
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    existing = db.query(models.User).filter(models.User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    h = hashlib.sha256(password.encode()).hexdigest()
    u = models.User(username=username, password_hash=h, name=name, role=role)
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "name": u.name, "username": u.username, "role": u.role}


@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    if user.id == user_id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404)
    db.delete(u)
    db.commit()
    return {"ok": True}


@app.put("/api/users/{user_id}/password")
def change_password(
    user_id: int,
    data: dict,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404)
    new_password = data.get("password", "")
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="Contraseña debe tener al menos 4 caracteres")
    u.password_hash = hashlib.sha256(new_password.encode()).hexdigest()
    db.commit()
    return {"ok": True}


# ---------- FRONTEND ----------

app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
def index():
    return FileResponse("frontend/index.html")


@app.exception_handler(404)
async def not_found(request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return FileResponse("frontend/index.html")
