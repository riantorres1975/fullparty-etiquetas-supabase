const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let backendProcess;

function getBackendPath() {
  // En producción (empaquetado), el exe está junto al ejecutable de Electron
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'servidor_etiquetas.exe');
  }
  // En desarrollo, usa Python directamente
  return null;
}

function startBackend() {
  const exePath = getBackendPath();

  if (exePath && fs.existsSync(exePath)) {
    console.log('Iniciando backend desde:', exePath);
    backendProcess = spawn(exePath, [], { detached: false, stdio: 'ignore' });
  } else {
    console.log('Modo desarrollo: asegúrate de correr uvicorn manualmente.');
  }
}

function stopBackend() {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch (e) {
      console.error('Error al detener backend:', e);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false,
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Abrir links externos en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();

  // Esperar 2 segundos para que el backend inicie antes de mostrar la ventana
  setTimeout(createWindow, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);
