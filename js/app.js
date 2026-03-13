/**
 * Full Party Labels — app.js
 * Frontend Vanilla JS para Electron
 * Conecta con FastAPI en localhost:8000
 */

const API = "http://127.0.0.1:8000";
const RETRY_INTERVAL = 3000;
const DELETE_CONFIRM_SECS = 3;

// ── Estado global ────────────────────────────────────────────────────────────
const state = {
  products: [],       // Lista completa desde API
  filtered: [],       // Lista filtrada por búsqueda
  editingId: null,    // ID del producto en edición
  selected: new Set(),// IDs seleccionados para batch print
  deleteTimers: {},   // Timers del smart-delete por producto ID
  backendOnline: false,
};

// ── Referencias DOM ──────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  sku:            $("input-sku"),
  name:           $("input-name"),
  price:          $("input-price"),
  btnSave:        $("btn-save"),
  btnCancelEdit:  $("btn-cancel-edit"),
  btnRefresh:     $("btn-refresh"),
  btnBatchPrint:  $("btn-batch-print"),
  btnClearSel:    $("btn-clear-selection"),
  editBanner:     $("edit-banner"),
  editSkuDisplay: $("edit-sku-display"),
  searchInput:    $("search-input"),
  tbody:          $("products-tbody"),
  emptyState:     $("empty-state"),
  loadingState:   $("loading-state"),
  statusBadge:    $("status-badge"),
  statusText:     $("status-text"),
  statTotal:      $("stat-total"),
  statLastSku:    $("stat-last-sku"),
  selectedCount:  $("selected-count"),
  visibleCount:   $("visible-count"),
  selectAll:      $("select-all"),
  toastContainer: $("toast-container"),
};

// ── Toast system ─────────────────────────────────────────────────────────────
function showToast(message, type = "info", duration = 3000) {
  const icons = {
    success: "✅",
    error:   "❌",
    info:    "💡",
    warning: "⚠️",
  };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] ?? "ℹ️"}</span><span>${message}</span>`;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

// ── Status indicator ─────────────────────────────────────────────────────────
function setStatus(status, text) {
  els.statusBadge.className = `status-badge status-${status}`;
  els.statusText.textContent = text;
  state.backendOnline = status === "online";
}

// ── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error desconocido" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res;
}

// ── Verificar backend ────────────────────────────────────────────────────────
async function checkBackend() {
  try {
    await apiFetch("/health");
    setStatus("online", "Supabase conectado");
    return true;
  } catch {
    setStatus("offline", "Sin conexión");
    return false;
  }
}

async function waitForBackend() {
  setStatus("connecting", "Conectando...");
  const ok = await checkBackend();
  if (ok) {
    loadProducts();
    return Promise.resolve();
  } else {
    return new Promise((resolve) => {
      setTimeout(() => waitForBackend().then(resolve), RETRY_INTERVAL);
    });
  }
}

// ── Load products ────────────────────────────────────────────────────────────
async function loadProducts(silent = false) {
  if (!silent) {
    els.loadingState.style.display = "flex";
    els.emptyState.classList.remove("visible");
  }

  try {
    const res = await apiFetch("/products");
    state.products = await res.json();
    applyFilter();
    updateStats();
  } catch (e) {
    showToast(`Error al cargar productos: ${e.message}`, "error");
    setStatus("offline", "Sin conexión");
  } finally {
    els.loadingState.style.display = "none";
  }
}

// ── Filter / Render ──────────────────────────────────────────────────────────
function applyFilter() {
  const q = els.searchInput.value.trim().toLowerCase();
  state.filtered = q
    ? state.products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.includes(q) ||
          String(p.price).includes(q)
      )
    : [...state.products];

  renderTable();
}

function renderTable(newId = null) {
  const rows = state.filtered.map((p) => buildRow(p, p.id === newId)).join("");
  els.tbody.innerHTML = rows;

  // Re-attach event listeners
  els.tbody.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", handleTableAction);
  });

  els.tbody.querySelectorAll(".row-checkbox").forEach((cb) => {
    cb.addEventListener("change", handleRowCheck);
    cb.checked = state.selected.has(Number(cb.dataset.id));
  });

  // Update visible count
  els.visibleCount.textContent = state.filtered.length;

  // Empty state
  if (state.filtered.length === 0) {
    els.emptyState.classList.add("visible");
  } else {
    els.emptyState.classList.remove("visible");
  }

  // Select-all state
  updateSelectAllState();
}

function buildRow(p, isNew = false) {
  const isSelected = state.selected.has(p.id);
  const price = parseFloat(p.price).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

  return `
    <tr class="${isSelected ? "selected" : ""} ${isNew ? "row-new" : ""}" data-id="${p.id}">
      <td class="px-3 py-3 text-center">
        <input type="checkbox" class="checkbox-custom row-checkbox" data-id="${p.id}" ${isSelected ? "checked" : ""} />
      </td>
      <td class="px-4 py-3">
        <span class="sku-badge">${escHtml(p.sku)}</span>
      </td>
      <td class="px-4 py-3" style="color:#1e1b4b;font-weight:500">${escHtml(p.name)}</td>
      <td class="px-4 py-3 text-right">
        <span class="price-tag">${price}</span>
      </td>
      <td class="px-4 py-3">
        <div class="action-group">
          <button class="action-btn print" data-action="print" data-id="${p.id}" title="Imprimir etiqueta">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
          </button>
          <button class="action-btn edit" data-action="edit" data-id="${p.id}" title="Editar">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button class="action-btn delete" data-action="delete" data-id="${p.id}" title="Eliminar">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Table actions ─────────────────────────────────────────────────────────────
function handleTableAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);

  if (action === "print") printLabel(id);
  else if (action === "edit") startEdit(id);
  else if (action === "delete") handleSmartDelete(btn, id);
}

// ── Smart Delete (sin confirm()) ──────────────────────────────────────────────
function handleSmartDelete(btn, id) {
  // Si ya hay un timer corriendo = confirmación
  if (state.deleteTimers[id]) {
    clearInterval(state.deleteTimers[id].interval);
    clearTimeout(state.deleteTimers[id].timeout);
    delete state.deleteTimers[id];
    deleteProduct(id);
    return;
  }

  // Primer click: iniciar countdown
  let secs = DELETE_CONFIRM_SECS;
  btn.classList.add("confirm-delete", "delete");
  btn.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> ${secs}s`;

  const interval = setInterval(() => {
    secs--;
    if (secs > 0) {
      btn.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> ${secs}s`;
    }
  }, 1000);

  const timeout = setTimeout(() => {
    clearInterval(interval);
    delete state.deleteTimers[id];
    // Restaurar botón
    btn.classList.remove("confirm-delete");
    btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;
  }, DELETE_CONFIRM_SECS * 1000);

  state.deleteTimers[id] = { interval, timeout };
}

async function deleteProduct(id) {
  try {
    await apiFetch(`/products/${id}`, { method: "DELETE" });
    state.products = state.products.filter((p) => p.id !== id);
    state.selected.delete(id);
    applyFilter();
    updateStats();
    updateBatchUI();
    showToast("Producto eliminado", "success");
  } catch (e) {
    showToast(`Error al eliminar: ${e.message}`, "error");
  }
}

// ── Save / Update product ─────────────────────────────────────────────────────
async function saveProduct() {
  const sku   = els.sku.value.trim();
  const name  = els.name.value.trim();
  const price = parseFloat(els.price.value);

  if (!name) { showToast("El nombre es obligatorio", "warning"); els.name.focus(); return; }
  if (isNaN(price) || price < 0) { showToast("Precio inválido", "warning"); els.price.focus(); return; }

  els.btnSave.disabled = true;

  try {
    if (state.editingId !== null) {
      // UPDATE
      const res = await apiFetch(`/products/${state.editingId}`, {
        method: "PUT",
        body: JSON.stringify({ name, price }),
      });
      const updated = await res.json();
      const idx = state.products.findIndex((p) => p.id === state.editingId);
      if (idx !== -1) state.products[idx] = updated;
      showToast(`"${updated.name}" actualizado ✓`, "success");
      cancelEdit();
    } else {
      // CREATE
      const body = { name, price };
      if (sku) body.sku = sku;

      const res = await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const created = await res.json();
      state.products.unshift(created); // Más recientes primero
      showToast(`"${created.name}" guardado ✓`, "success");
      els.statLastSku.textContent = created.sku;
      clearForm();
    }

    applyFilter();
    updateStats();
    els.sku.focus();

  } catch (e) {
    showToast(`Error: ${e.message}`, "error");
  } finally {
    els.btnSave.disabled = false;
  }
}

// ── Edit mode ─────────────────────────────────────────────────────────────────
function startEdit(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  state.editingId = id;
  els.sku.value   = product.sku;
  els.name.value  = product.name;
  els.price.value = product.price;

  // Deshabilitar SKU en edición
  els.sku.disabled = true;

  els.editBanner.classList.remove("hidden");
  els.editSkuDisplay.textContent = `SKU: ${product.sku}`;
  els.btnSave.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
    </svg>
    <span>Actualizar Producto</span>`;

  els.name.focus();
  els.name.select();
}

function cancelEdit() {
  state.editingId = null;
  els.sku.disabled = false;
  els.editBanner.classList.add("hidden");
  els.btnSave.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
    <span>Guardar Producto</span>`;
  clearForm();
}

function clearForm() {
  els.sku.value   = "";
  els.name.value  = "";
  els.price.value = "";
  els.sku.disabled = false;
}

// ── Configuración de tienda ───────────────────────────────────────────────────
const STORE_KEY = "fullparty_store_name";

function getStoreName() {
  return localStorage.getItem(STORE_KEY) || "Full Party Uruapan";
}

function saveStoreName(name) {
  localStorage.setItem(STORE_KEY, name.trim() || "Full Party Uruapan");
}

// ── Modal de impresión ────────────────────────────────────────────────────────
// Estado del modal
const printModal = {
  mode: null,      // 'single' | 'batch'
  productId: null,
  showPrice: true,
  productIds: [],
};

function openPrintModal(mode, opts = {}) {
  printModal.mode       = mode;
  printModal.productId  = opts.productId ?? null;
  printModal.productIds = opts.productIds ?? [];

  const title = mode === "single"
    ? `Imprimir — ${opts.productName ?? ""}`
    : `Imprimir ${opts.productIds.length} etiqueta(s)`;

  $("modal-print-title").textContent = title;

  // Restaurar valores guardados
  $("modal-store-name").value   = getStoreName();
  $("modal-store-check").checked = localStorage.getItem("fullparty_show_store") !== "false";
  $("modal-price-check").checked = localStorage.getItem("fullparty_show_price") !== "false";

  $("print-modal-overlay").classList.remove("hidden");
  $("modal-store-name").focus();
  $("modal-store-name").select();
}

function closePrintModal() {
  $("print-modal-overlay").classList.add("hidden");
}

function loadPrinters() {} // no-op

async function confirmPrint() {
  const showStore = $("modal-store-check").checked;
  const showPrice = $("modal-price-check").checked;
  const storeName = $("modal-store-name").value.trim() || getStoreName();

  // Guardar preferencias
  saveStoreName(storeName);
  localStorage.setItem("fullparty_show_store", showStore);
  localStorage.setItem("fullparty_show_price", showPrice);

  closePrintModal();

  if (printModal.mode === "single") {
    await executePrint({
      productId: printModal.productId,
      showPrice,
      showStore,
      storeName,
      isBatch: false,
      count: 1,
    });
  } else {
    await executePrint({
      productIds: printModal.productIds,
      showPrice,
      showStore,
      storeName,
      isBatch: true,
      count: printModal.productIds.length,
    });
  }
}

async function executePrint({ productId, productIds, showPrice, showStore, storeName, isBatch, count }) {
  try {
    const openUrl = async (url, fetchOptions = null) => {
      if (typeof require !== "undefined") {
        const { shell } = require("electron");
        if (fetchOptions) {
          const res = await fetch(url, fetchOptions);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf  = Buffer.from(await res.arrayBuffer());
          const os   = require("os");
          const path = require("path");
          const fs   = require("fs");
          const tmp  = path.join(os.tmpdir(), `fullparty_${Date.now()}.pdf`);
          fs.writeFileSync(tmp, buf);
          await shell.openPath(tmp);
          setTimeout(() => { try { fs.unlinkSync(tmp); } catch (_) {} }, 60000);
        } else {
          await shell.openExternal(url);
        }
      } else {
        if (fetchOptions) {
          const res  = await fetch(url, fetchOptions);
          const blob = await res.blob();
          window.open(URL.createObjectURL(blob), "_blank");
        } else {
          window.open(url, "_blank");
        }
      }
    };

    if (isBatch) {
      await openUrl(`${API}/products/batch-labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: productIds,
          show_price: showPrice,
          show_store: showStore,
          store_name: storeName,
        }),
      });
    } else {
      const params = new URLSearchParams({
        show_price: showPrice,
        show_store: showStore,
        store_name: storeName,
      });
      await openUrl(`${API}/products/${productId}/label?${params}`);
    }

    const label = isBatch ? `${count} etiqueta(s)` : "Etiqueta";
    showToast(`${label} abierta para imprimir ✓`, "success");

  } catch (e) {
    showToast(`Error al imprimir: ${e.message}`, "error");
  }
}

// ── Print label ───────────────────────────────────────────────────────────────
async function printLabel(id) {
  const product = state.products.find(p => p.id === id);
  openPrintModal("single", {
    productId: id,
    productName: product?.name ?? "",
  });
}

async function printBatch() {
  if (state.selected.size === 0) return;
  openPrintModal("batch", {
    productIds: Array.from(state.selected),
  });
}


// ── Selection ─────────────────────────────────────────────────────────────────
function handleRowCheck(e) {
  const id = Number(e.target.dataset.id);
  if (e.target.checked) {
    state.selected.add(id);
  } else {
    state.selected.delete(id);
  }
  // Highlight row
  const row = e.target.closest("tr");
  if (row) row.classList.toggle("selected", e.target.checked);

  updateBatchUI();
  updateSelectAllState();
}

function updateSelectAllState() {
  const visibleIds = state.filtered.map((p) => p.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
  els.selectAll.checked = allChecked;
  els.selectAll.indeterminate = !allChecked && visibleIds.some((id) => state.selected.has(id));
}

function handleSelectAll(e) {
  const visibleIds = state.filtered.map((p) => p.id);
  if (e.target.checked) {
    visibleIds.forEach((id) => state.selected.add(id));
  } else {
    visibleIds.forEach((id) => state.selected.delete(id));
  }
  renderTable();
  updateBatchUI();
}

function clearSelection() {
  state.selected.clear();
  renderTable();
  updateBatchUI();
}

function updateBatchUI() {
  const count = state.selected.size;
  els.selectedCount.textContent = count;
  els.btnBatchPrint.disabled = count === 0;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  els.statTotal.textContent = state.products.length;
  if (state.products.length > 0) {
    els.statLastSku.textContent = state.products[0].sku;
  }
}

// ── Keyboard navigation (SKU → Nombre → Precio → Guardar) ────────────────────
function setupKeyboardNav() {
  const enterNav = (e, next) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (next === "save") saveProduct();
      else next.focus();
    }
  };

  els.sku.addEventListener("keydown",   (e) => enterNav(e, els.name));
  els.name.addEventListener("keydown",  (e) => enterNav(e, els.price));
  els.price.addEventListener("keydown", (e) => enterNav(e, "save"));
}

// ── Event listeners ──────────────────────────────────────────────────────────
function setupListeners() {
  els.btnSave.addEventListener("click", saveProduct);
  els.btnCancelEdit.addEventListener("click", cancelEdit);
  els.btnRefresh.addEventListener("click", async () => {
    els.btnRefresh.classList.add("spinning");
    await loadProducts();
    els.btnRefresh.classList.remove("spinning");
  });
  els.btnBatchPrint.addEventListener("click", printBatch);
  els.btnClearSel.addEventListener("click", clearSelection);
  els.searchInput.addEventListener("input", applyFilter);
  els.selectAll.addEventListener("change", handleSelectAll);

  // Import / Export
  $("btn-export").addEventListener("click", exportCSV);
  $("file-import").addEventListener("change", (e) => importFile(e.target.files[0]));
}

// ── Export CSV ────────────────────────────────────────────────────────────────
async function exportCSV() {
  try {
    const url = `${API}/products/export/csv`;
    if (typeof require !== "undefined") {
      // Electron: descargar con fetch y guardar con dialog
      const response = await fetch(url);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { dialog, app } = require("electron").remote ?? {};
      // Si no hay remote, abrir en el navegador como fallback
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "fullparty_productos.csv";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = "fullparty_productos.csv";
      a.click();
    }
    showToast("CSV descargado correctamente", "success");
  } catch (e) {
    showToast(`Error al exportar: ${e.message}`, "error");
  }
}

// ── Import CSV/Excel ──────────────────────────────────────────────────────────
async function importFile(file) {
  if (!file) return;

  const ext = file.name.split(".").pop().toLowerCase();
  let csvFile = file;

  // Si es Excel, convertir a CSV en el cliente con SheetJS
  if (ext === "xlsx" || ext === "xls") {
    try {
      const XLSX = await loadSheetJS();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const csvText = XLSX.utils.sheet_to_csv(sheet);
      csvFile = new File([csvText], file.name.replace(/\.(xlsx|xls)$/, ".csv"), { type: "text/csv" });
    } catch (e) {
      showToast("Error al leer Excel: " + e.message, "error");
      return;
    }
  }

  const formData = new FormData();
  formData.append("file", csvFile);

  // Mostrar spinner en botón
  const label = document.querySelector("label.btn-import span");
  const original = label.textContent;
  label.textContent = "Importando...";

  try {
    const res = await fetch(`${API}/products/import/csv`, {
      method: "POST",
      body: formData,
    });

    const result = await res.json();

    if (!res.ok) {
      showToast(`Error: ${result.detail}`, "error");
      return;
    }

    // Mostrar resultado
    const panel = $("import-result");
    panel.classList.remove("hidden");

    const errHtml = result.errors.length > 0
      ? `<details class="mt-2">
           <summary class="cursor-pointer text-amber-600 font-semibold">${result.errors.length} advertencia(s)</summary>
           <ul class="mt-1 space-y-0.5 text-amber-700">
             ${result.errors.map(e => `<li>• ${escHtml(e)}</li>`).join("")}
           </ul>
         </details>`
      : "";

    panel.innerHTML = `
      <p class="font-bold text-green-700 mb-1">✅ Importación completada</p>
      <p class="text-gray-700">Insertados: <strong>${result.inserted}</strong></p>
      <p class="text-gray-700">Omitidos: <strong>${result.skipped}</strong></p>
      ${errHtml}
    `;

    if (result.inserted > 0) {
      showToast(`${result.inserted} productos importados`, "success");
      await loadProducts(true);
    } else {
      showToast("No se insertaron nuevos productos", "warning");
    }

  } catch (e) {
    showToast(`Error al importar: ${e.message}`, "error");
  } finally {
    label.textContent = original;
    // Limpiar el input para permitir subir el mismo archivo de nuevo
    $("file-import").value = "";
  }
}

// Carga SheetJS dinámicamente solo si se necesita
function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("No se pudo cargar SheetJS"));
    document.head.appendChild(script);
  });
}

// ── Presence system ───────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 15000;
const PRODUCTS_POLL_INTERVAL = 10000; // recargar productos cada 10s

// Detectar IP pública
async function getLocalIP() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip || null;
  } catch (_) {
    // Fallback: IP local si no hay internet
    try {
      if (typeof require !== "undefined") {
        const os = require("os");
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
              return iface.address;
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }
}
let sessionId = null;
let usersPanelOpen = false;

async function sendHeartbeat() {
  if (!state.backendOnline) return;
  try {
    const localIP = await getLocalIP();
    const body = { session_id: sessionId };
    if (localIP) body.client_ip = localIP;

    const res = await fetch(`${API}/presence/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    sessionId = data.session_id;
    updateUsersBadge(data.online);
    if (usersPanelOpen) fetchUsersPanel();
  } catch (_) {}
}

function updateUsersBadge(count) {
  const el = $("users-count");
  if (el) el.textContent = count;
}

async function fetchUsersPanel() {
  try {
    const res = await apiFetch("/presence/users");
    const data = await res.json();
    renderUsersPanel(data);
  } catch (_) {}
}

function renderUsersPanel(data) {
  const list = $("users-list");
  if (!list) return;

  if (data.users.length === 0) {
    list.innerHTML = `<p class="text-xs text-gray-400 text-center py-3">Sin usuarios activos</p>`;
    return;
  }

  list.innerHTML = data.users.map((u, i) => {
    const isSelf = u.session_id === sessionId;
    const timeStr = u.last_seen < 5 ? "Ahora mismo" : `Hace ${u.last_seen}s`;
    return `
      <div class="user-row">
        <div class="user-avatar">${i + 1}</div>
        <div class="user-info">
          <p class="user-ip">${escHtml(u.ip)}</p>
          <p class="user-time">${timeStr}</p>
        </div>
        ${isSelf ? '<span class="user-self">Tú</span>' : ""}
      </div>`;
  }).join("");
}

function toggleUsersPanel() {
  const panel = $("users-panel");
  usersPanelOpen = !usersPanelOpen;
  if (usersPanelOpen) {
    panel.classList.remove("hidden");
    fetchUsersPanel();
  } else {
    panel.classList.add("hidden");
  }
}

function startHeartbeat() {
  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  // Recargar productos automáticamente cada 10s para ver cambios de otras PCs
  setInterval(() => loadProducts(true), PRODUCTS_POLL_INTERVAL);
}

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  setupKeyboardNav();
  setupListeners();

  // Usuarios panel
  $("btn-users").addEventListener("click", toggleUsersPanel);
  $("btn-close-users").addEventListener("click", () => {
    $("users-panel").classList.add("hidden");
    usersPanelOpen = false;
  });

  // Cerrar panel al hacer click fuera
  document.addEventListener("click", (e) => {
    if (usersPanelOpen &&
        !$("users-panel").contains(e.target) &&
        !$("btn-users").contains(e.target)) {
      $("users-panel").classList.add("hidden");
      usersPanelOpen = false;
    }
  });

  waitForBackend().then(() => startHeartbeat());
})();
