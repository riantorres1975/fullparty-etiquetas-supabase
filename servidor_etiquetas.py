"""
Full Party Labels - Backend API
FastAPI + SQLAlchemy + Supabase (PostgreSQL)
Genera etiquetas PDF 62mm x 29mm para Brother QL-800
"""

import os, io, csv, random, sys, time, uuid, logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator, ConfigDict

from sqlalchemy import create_engine, Column, Integer, String, Numeric, DateTime, func
from sqlalchemy.orm import declarative_base, sessionmaker

from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.graphics.barcode import eanbc
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.pdfgen import canvas

import dotenv

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

if getattr(sys, "frozen", False):
    base_dir = os.path.dirname(sys.executable)
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

dotenv.load_dotenv(os.path.join(base_dir, ".env"))
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    log.error("DATABASE_URL no encontrada en .env")
    sys.exit(1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10,
                       connect_args={"connect_timeout": 10})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Product(Base):
    __tablename__ = "products"
    id         = Column(Integer, primary_key=True, index=True)
    sku        = Column(String(13), unique=True, index=True, nullable=False)
    name       = Column(String(120), nullable=False)
    price      = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Presence(Base):
    __tablename__ = "presence"
    session_id = Column(String(36), primary_key=True)
    ip         = Column(String(45), nullable=False)
    last_seen  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

PRESENCE_TTL = 30

def cleanup_presence():
    db = SessionLocal()
    try:
        cutoff = time.time() - PRESENCE_TTL
        from sqlalchemy import text
        db.execute(text("DELETE FROM presence WHERE last_seen < NOW() - INTERVAL '30 seconds'"))
        db.commit()
    except: db.rollback()
    finally: db.close()


class ProductCreate(BaseModel):
    sku:   Optional[str] = None
    name:  str
    price: float

    @field_validator("name")
    @classmethod
    def to_title(cls, v): return v.strip().title()

    @field_validator("sku", mode="before")
    @classmethod
    def clean_sku(cls, v): return str(v).strip() if v and str(v).strip() else None


class ProductUpdate(BaseModel):
    name:  Optional[str]   = None
    price: Optional[float] = None

    @field_validator("name")
    @classmethod
    def to_title(cls, v): return v.strip().title() if v else v


class ProductOut(BaseModel):
    id: int; sku: str; name: str; price: float
    model_config = ConfigDict(from_attributes=True)


class ImportResult(BaseModel):
    inserted: int; skipped: int; errors: list[str]


@asynccontextmanager
async def lifespan(app):
    log.info("Iniciando Full Party Labels Backend...")
    Base.metadata.create_all(bind=engine)
    log.info("Tablas verificadas.")
    yield

app = FastAPI(title="Full Party Labels API", version="3.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def generate_ean13() -> str:
    digits = [random.randint(0, 9) for _ in range(12)]
    odd  = sum(digits[i] for i in range(0, 12, 2))
    even = sum(digits[i] for i in range(1, 12, 2))
    check = (10 - ((odd + even * 3) % 10)) % 10
    digits.append(check)
    return "".join(map(str, digits))


def build_label_pdf(sku: str, name: str, price: float,
                    show_price: bool = True,
                    show_store: bool = False,
                    store_name: str = "") -> bytes:
    WIDTH = 62 * mm
    HEIGHT = 29 * mm
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(WIDTH, HEIGHT))
    c.setFillColor(colors.white)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)

    # Nombre de tienda
    y_name = HEIGHT - 7 * mm
    if show_store and store_name:
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.black)
        c.drawCentredString(WIDTH / 2, HEIGHT - 5.5 * mm, store_name.upper())
        y_name = HEIGHT - 9.5 * mm

    # Nombre del producto
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(colors.black)
    display_name = name if len(name) <= 32 else name[:31] + "..."
    c.drawCentredString(WIDTH / 2, y_name, display_name)

    # Código de barras
    try:
        barcode = eanbc.Ean13BarcodeWidget(sku)
        
        # Lógica de código gigante
        if not show_store and not show_price:
            barcode.barHeight = 16 * mm
            barcode.barWidth  = 0.9
            barcode.fontSize  = 8
        else:
            barcode.barHeight = 10 * mm
            barcode.barWidth  = 0.7
            barcode.fontSize  = 6
            
        barcode.humanReadable = True
        d = Drawing(); d.add(barcode)
        bounds = d.getBounds()
        bw = bounds[2] - bounds[0]
        bh = bounds[3] - bounds[1]
        
        if not show_price:
            y_pos = (y_name - bh) / 2 - bounds[1] 
        else:
            y_pos = (HEIGHT - 5 * mm - bh) / 2 - bounds[1] + 1 * mm

        renderPDF.draw(d, c, (WIDTH - bw) / 2 - bounds[0], y_pos)
        
    except Exception as e:
        log.warning(f"Barcode fallback '{sku}': {e}")
        c.setFont("Courier-Bold", 8)
        c.drawCentredString(WIDTH / 2, HEIGHT / 2, sku)

    # Precio
    if show_price:
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.black)
        c.drawCentredString(WIDTH / 2, 4 * mm, f"${price:,.2f} MXN")

    c.save(); buffer.seek(0)
    return buffer.read()


# ═══ ENDPOINTS ════════════════════════════════════════════════════════════════
# REGLA: rutas fijas ANTES que rutas con {product_id}

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/presence/heartbeat")
async def heartbeat(request: Request):
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
    body = {}
    if request.headers.get("content-type", "").startswith("application/json"):
        body = await request.json()
    sid = body.get("session_id") or str(uuid.uuid4())
    if body.get("client_ip"):
        ip = body["client_ip"]

    db = SessionLocal()
    try:
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        stmt = pg_insert(Presence).values(session_id=sid, ip=ip, last_seen=func.now())
        stmt = stmt.on_conflict_do_update(
            index_elements=["session_id"],
            set_={"ip": ip, "last_seen": func.now()}
        )
        db.execute(stmt)
        db.commit()
        cleanup_presence()
        count = db.query(Presence).count()
    except Exception as e:
        db.rollback()
        log.warning(f"Heartbeat error: {e}")
        count = 1
    finally:
        db.close()

    return {"session_id": sid, "online": count}

@app.get("/presence/users")
def get_users():
    cleanup_presence()
    db = SessionLocal()
    try:
        from sqlalchemy import text
        rows = db.execute(text(
            "SELECT session_id, ip, EXTRACT(EPOCH FROM (NOW() - last_seen))::int AS last_seen "
            "FROM presence ORDER BY last_seen ASC"
        )).fetchall()
        users = [{"session_id": r[0], "ip": r[1], "last_seen": r[2]} for r in rows]
        return {"count": len(users), "users": users}
    except Exception as e:
        log.warning(f"get_users error: {e}")
        return {"count": 0, "users": []}
    finally:
        db.close()

@app.get("/products", response_model=list[ProductOut])
def list_products():
    db = SessionLocal()
    try: return db.query(Product).order_by(Product.id.desc()).all()
    finally: db.close()

@app.post("/products", response_model=ProductOut, status_code=201)
def create_product(data: ProductCreate):
    db = SessionLocal()
    try:
        sku = data.sku
        if not sku:
            for _ in range(10):
                c = generate_ean13()
                if not db.query(Product).filter(Product.sku == c).first():
                    sku = c; break
            else: raise HTTPException(500, "No se pudo generar SKU.")
        if db.query(Product).filter(Product.sku == sku).first():
            raise HTTPException(409, f"SKU '{sku}' ya existe.")
        p = Product(sku=sku, name=data.name, price=data.price)
        db.add(p); db.commit(); db.refresh(p)
        return p
    finally: db.close()

class BatchRequest(BaseModel):
    ids:        list[int]
    show_price: bool = True
    show_store: bool = False
    store_name: str  = ""

@app.post("/products/batch-labels")
def batch_labels(req: BatchRequest):
    db = SessionLocal()
    try:
        products = db.query(Product).filter(Product.id.in_(req.ids)).all()
        if not products: raise HTTPException(404, "No se encontraron productos.")
        WIDTH = 62 * mm; HEIGHT = 29 * mm
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=(WIDTH, HEIGHT))
        for i, p in enumerate(products):
            if i > 0: c.showPage()
            
            # --- Lógica de renderizado actualizada ---
            c.setFillColor(colors.white); c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
            
            y_name = HEIGHT - 7 * mm
            if req.show_store and req.store_name:
                c.setFont("Helvetica-Bold", 8); c.setFillColor(colors.black)
                c.drawCentredString(WIDTH / 2, HEIGHT - 5.5 * mm, req.store_name.upper())
                y_name = HEIGHT - 9.5 * mm
                
            c.setFont("Helvetica-Bold", 7); c.setFillColor(colors.black)
            dn = p.name if len(p.name) <= 32 else p.name[:31] + "..."
            c.drawCentredString(WIDTH / 2, y_name, dn)
            
            try:
                bc = eanbc.Ean13BarcodeWidget(p.sku)
                if not req.show_store and not req.show_price:
                    bc.barHeight = 16 * mm; bc.barWidth = 0.9; bc.fontSize = 8
                else:
                    bc.barHeight = 10 * mm; bc.barWidth = 0.7; bc.fontSize = 6
                
                bc.humanReadable = True
                d = Drawing(); d.add(bc)
                b = d.getBounds()
                bw = b[2]-b[0]; bh = b[3]-b[1]
                
                if not req.show_price:
                    y_pos = (y_name - bh) / 2 - b[1]
                else:
                    y_pos = (HEIGHT - 5 * mm - bh) / 2 - b[1] + 1 * mm
                    
                renderPDF.draw(d, c, (WIDTH-bw)/2-b[0], y_pos)
            except Exception as e:
                log.warning(f"Barcode fallback '{p.sku}': {e}")
                c.setFont("Courier-Bold", 8); c.drawCentredString(WIDTH/2, HEIGHT/2, p.sku)
                
            if req.show_price:
                c.setFont("Helvetica-Bold", 8); c.setFillColor(colors.black)
                c.drawCentredString(WIDTH/2, 4*mm, f"${float(p.price):,.2f} MXN")
                
        c.save(); buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/pdf",
                                 headers={"Content-Disposition": "inline; filename=batch.pdf"})
    finally: db.close()

@app.get("/products/export/csv")
def export_csv():
    db = SessionLocal()
    try:
        products = db.query(Product).order_by(Product.id.asc()).all()
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["sku", "name", "price"])
        for p in products: w.writerow([p.sku, p.name, float(p.price)])
        out.seek(0)
        return StreamingResponse(io.BytesIO(out.getvalue().encode("utf-8-sig")),
                                 media_type="text/csv",
                                 headers={"Content-Disposition": "attachment; filename=fullparty.csv"})
    finally: db.close()

@app.post("/products/import/csv", response_model=ImportResult)
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try: text = content.decode(enc); break
        except UnicodeDecodeError: pass
    if text is None: raise HTTPException(400, "No se pudo leer el archivo.")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames: raise HTTPException(400, "Sin encabezados.")
    fl = [f.strip().lower() for f in reader.fieldnames]
    miss = {"sku", "name", "price"} - set(fl)
    if miss: raise HTTPException(400, f"Columnas faltantes: {', '.join(miss)}")
    col_map = {o.strip(): o.strip().lower() for o in reader.fieldnames}
    db = SessionLocal(); inserted = skipped = 0; errors = []
    try:
        for i, row in enumerate(reader, 2):
            norm = {col_map.get(k, k.strip().lower()): (v or "").strip() for k, v in row.items()}
            raw_sku = norm.get("sku", "")
            raw_name = norm.get("name", "")
            raw_price = norm.get("price", "").replace("$", "").replace(",", "")
            if not raw_name: errors.append(f"Fila {i}: nombre vacío."); skipped += 1; continue
            try: price = float(raw_price)
            except: errors.append(f"Fila {i}: precio inválido."); skipped += 1; continue
            if not raw_sku:
                for _ in range(10):
                    cand = generate_ean13()
                    if not db.query(Product).filter(Product.sku == cand).first():
                        raw_sku = cand; break
                else: errors.append(f"Fila {i}: no se pudo generar SKU."); skipped += 1; continue
            if db.query(Product).filter(Product.sku == raw_sku).first():
                errors.append(f"Fila {i}: SKU '{raw_sku}' ya existe."); skipped += 1; continue
            db.add(Product(sku=raw_sku, name=raw_name.title(), price=price)); inserted += 1
        db.commit()
    except Exception as e: db.rollback(); raise HTTPException(500, str(e))
    finally: db.close()
    return ImportResult(inserted=inserted, skipped=skipped, errors=errors)

# Rutas con {product_id} AL FINAL para no capturar rutas fijas
@app.put("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, data: ProductUpdate):
    db = SessionLocal()
    try:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p: raise HTTPException(404, "Producto no encontrado.")
        if data.name  is not None: p.name  = data.name
        if data.price is not None: p.price = data.price
        db.commit(); db.refresh(p); return p
    finally: db.close()

@app.delete("/products/{product_id}")
def delete_product(product_id: int):
    db = SessionLocal()
    try:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p: raise HTTPException(404, "Producto no encontrado.")
        db.delete(p); db.commit()
        return {"message": f"Producto {product_id} eliminado."}
    finally: db.close()

@app.get("/products/{product_id}/label")
def get_label(product_id: int, show_price: bool = True, show_store: bool = False, store_name: str = ""):
    db = SessionLocal()
    try:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p: raise HTTPException(404, "Producto no encontrado.")
        pdf = build_label_pdf(p.sku, p.name, float(p.price),
                              show_price=show_price,
                              show_store=show_store,
                              store_name=store_name)
        return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                                 headers={"Content-Disposition": f'inline; filename="{p.sku}.pdf"'})
    finally: db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
