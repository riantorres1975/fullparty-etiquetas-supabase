# 🎉 Full Party Labels

Sistema de etiquetas con código de barras EAN-13 para **Full Party Uruapan, Michoacán**.  
Aplicación de escritorio (Windows) construida con Electron + FastAPI + Supabase.

---

## 🖥️ Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend / Desktop | Electron.js + HTML5 + Tailwind CSS |
| Backend local | FastAPI (Python 3.13) |
| Base de datos | Supabase (PostgreSQL) |
| Impresora | Brother QL-800 — cinta 62mm |

---

## 📁 Estructura del proyecto

```
fullparty-etiquetas/
├── main.js                  # Electron — ventana principal + arranque del backend
├── index.html               # UI principal
├── css/
│   └── styles.css           # Estilos (tema claro, morado + teal)
├── js/
│   └── app.js               # Lógica frontend completa
├── servidor_etiquetas.py    # Backend FastAPI
├── requirements.txt         # Dependencias Python
├── package.json             # Electron + electron-builder
├── .env.example             # Plantilla de variables de entorno
└── README.md
```

---

## ⚙️ Requisitos previos

### Python
- **Python 3.13** (no usar 3.14 — incompatible con PyInstaller)
- Descargar en: https://www.python.org/downloads/release/python-3130/

### Node.js
- Node.js 18 o superior

### Cuenta Supabase
- Proyecto creado en https://supabase.com
- La tabla `products` se crea automáticamente al arrancar

---

## 🚀 Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/riantorres1975/fullparty-etiquetas-supabase.git
cd fullparty-etiquetas-supabase
```

### 2. Configurar variables de entorno

```bash
copy .env.example .env
```

Editar `.env` con tus credenciales de Supabase:

```env
DATABASE_URL=postgresql://postgres.XXXXXXXX:TU_PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres
```

> **Nota:** Usar el puerto **5432** con la URL del pooler de Supabase.

### 3. Instalar dependencias Python (usar Python 3.13)

```powershell
py -3.13 -m pip install -r requirements.txt
```

### 4. Instalar dependencias Node.js

```bash
npm install
```

---

## 🏃 Ejecutar en desarrollo

Necesitas **dos terminales**:

**Terminal 1 — Backend:**
```powershell
py -3.13 servidor_etiquetas.py
```
El servidor arranca en `http://127.0.0.1:8000`

**Terminal 2 — Frontend Electron:**
```bash
npm start
```

---

## 📦 Funcionalidades

- ✅ **CRUD de productos** — Crear, editar y eliminar con SKU EAN-13 auto-generado
- ✅ **Impresión de etiquetas** — PDF 62×29mm para Brother QL-800
- ✅ **Nombre de tienda configurable** — Se puede mostrar u ocultar en cada etiqueta
- ✅ **Precio opcional** — Toggle para imprimir con o sin precio
- ✅ **Impresión batch** — Seleccionar múltiples productos e imprimir juntos
- ✅ **Importar/Exportar CSV y Excel** — Para carga masiva de productos
- ✅ **Búsqueda en tiempo real** — Filtro instantáneo por nombre o SKU
- ✅ **Usuarios conectados** — Muestra cuántas instancias están activas y sus IPs
- ✅ **Sincronización en tiempo real** — Todos los cambios se reflejan en Supabase

---

## 🏗️ Compilar para producción (Windows .exe)

### Paso 1 — Empaquetar el backend con PyInstaller

```powershell
py -3.13 -m pip install python-multipart pyinstaller

Remove-Item -Recurse -Force backend -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
Remove-Item -Force servidor_etiquetas.spec -ErrorAction SilentlyContinue

py -3.13 -m PyInstaller --onefile --noconsole --distpath backend --name servidor_etiquetas --collect-all fastapi --collect-all uvicorn --collect-all starlette --collect-all sqlalchemy --collect-all psycopg2 --collect-all reportlab --collect-all dotenv --collect-all pydantic --collect-all pydantic_core --collect-all anyio --collect-all click --collect-all h11 --collect-all multipart servidor_etiquetas.py
```

### Paso 2 — Verificar que el exe funciona

Copiar el `.env` a la carpeta backend y probar:

```powershell
Copy-Item .env backend\.env
backend\servidor_etiquetas.exe
```

Debe mostrar `Application startup complete.`

### Paso 3 — Generar el instalador

```powershell
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npm run build
```

El instalador queda en `dist\Full Party Labels Setup 2.0.0.exe`

---

## 💻 Instalar en otra PC

1. Copiar `dist\Full Party Labels Setup 2.0.0.exe` a la otra PC e instalar
2. Después de instalar, copiar el archivo `.env` a:
   ```
   C:\Program Files\Full Party Labels\resources\.env
   ```
3. Abrir la app — debe conectarse automáticamente a Supabase

---

## 🗄️ Base de datos

La tabla `products` se crea automáticamente al iniciar el servidor:

```sql
CREATE TABLE products (
    id         SERIAL PRIMARY KEY,
    sku        VARCHAR(13) UNIQUE NOT NULL,
    name       VARCHAR(120) NOT NULL,
    price      NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔌 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor |
| GET | `/products` | Listar productos |
| POST | `/products` | Crear producto |
| PUT | `/products/{id}` | Actualizar producto |
| DELETE | `/products/{id}` | Eliminar producto |
| GET | `/products/{id}/label` | PDF etiqueta individual |
| POST | `/products/batch-labels` | PDF etiquetas múltiples |
| GET | `/products/export/csv` | Exportar CSV |
| POST | `/products/import/csv` | Importar CSV/Excel |
| POST | `/presence/heartbeat` | Registrar sesión activa |
| GET | `/presence/users` | Usuarios conectados |

---

## ⚠️ Notas importantes

- Usar siempre **Python 3.13** — Python 3.14 es incompatible con PyInstaller y FastAPI
- El archivo `.env` **nunca se sube a GitHub** — está en `.gitignore`
- Al instalar en una PC nueva, el `.env` debe copiarse manualmente a `resources\`
- Si el puerto 8000 está ocupado al probar el exe, cerrar otras instancias primero

---

## 🔒 Seguridad

El archivo `.env` contiene credenciales sensibles. **Nunca lo subas a GitHub.**

---

## 📄 Licencia

Uso interno — Full Party Uruapan, Michoacán 🎉
