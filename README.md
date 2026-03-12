# 🎉 Full Party Labels v2.0

Sistema de gestión de inventario y etiquetas de código de barras para **Full Party**, Uruapan, Michoacán.  
Impresora compatible: **Brother QL-800** (etiquetas 62mm × 29mm).

---

## 🏗️ Arquitectura

```
fullparty-etiquetas/
├── main.js                  # Electron — ventana principal
├── index.html               # UI principal
├── css/styles.css           # Estilos (Morado + Teal)
├── js/app.js                # Lógica frontend (Vanilla JS)
├── servidor_etiquetas.py    # Backend FastAPI
├── requirements.txt         # Dependencias Python
├── package.json             # Dependencias Electron
├── build_exe.py             # Script de compilación
├── .env.example             # Plantilla de variables de entorno
└── dist/
    └── servidor_etiquetas.exe  # (generado por build_exe.py)
```

---

## ⚙️ Configuración inicial

### 1. Supabase (Base de datos)

1. Ve a [supabase.com](https://supabase.com) → Crea un proyecto gratis
2. Ve a **Settings → Database → Connection Pooling**
3. Activa **IPv4** y copia la cadena de conexión con **puerto 6543** (Transaction mode)
4. Copia `.env.example` → `.env` y pega tu `DATABASE_URL`

```bash
cp .env.example .env
# Edita .env con tu cadena de Supabase
```

Las tablas se crean **automáticamente** al iniciar el servidor.

---

### 2. Backend Python

```bash
# Instalar dependencias
pip install -r requirements.txt

# Desarrollo (sin compilar)
python servidor_etiquetas.py
```

---

### 3. Frontend Electron

```bash
# Instalar dependencias de Node
npm install

# Desarrollo (requiere python servidor_etiquetas.py corriendo)
npm start
```

---

## 📦 Compilar para distribución (Windows)

```bash
# 1. Compilar el backend como .exe
python build_exe.py

# 2. Empaquetar Electron + backend
npm run build
```

El instalador quedará en `dist/Full Party Labels Setup.exe`.  
Incluye automáticamente `servidor_etiquetas.exe` y el `.env`.

---

## 🎮 Atajos de teclado

| Tecla    | Acción                          |
|----------|---------------------------------|
| `Enter`  | Navegar SKU → Nombre → Precio → Guardar |
| `Esc`    | Cancelar edición                |

---

## 🖨️ Impresión de etiquetas

- **Individual**: Botón 🖨️ en cada fila → abre PDF para imprimir
- **Batch**: Selecciona con checkboxes → "Imprimir Selección"
- Tamaño: **62mm × 29mm** (DK-22205 o similar)
- Configurar la Brother QL-800 en modo "Sin márgenes"

---

## 🔧 Smart Delete

El botón de eliminar requiere **2 clicks** para confirmar:
1. Primer click → aparece contador de 3 segundos
2. Segundo click dentro del tiempo → elimina
3. Sin segundo click → se cancela automáticamente

Esto evita bloqueos de ventana en Windows (sin `window.confirm()`).

---

## 📡 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor |
| GET | `/products` | Listar todos (más recientes primero) |
| POST | `/products` | Crear producto |
| PUT | `/products/{id}` | Actualizar nombre/precio |
| DELETE | `/products/{id}` | Eliminar |
| GET | `/products/{id}/label` | PDF etiqueta individual |
| POST | `/products/batch-labels` | PDF etiquetas múltiples |
