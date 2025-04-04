const { app, BrowserWindow, ipcMain, Notification, Menu, Tray, dialog } = require('electron');
const path = require('path');
const url = require('url');
const { autoUpdater } = require('electron-updater');

// Configuración de registros para actualizaciones
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Mantener una referencia global del objeto window para evitar
// que la ventana se cierre automáticamente cuando el objeto JavaScript es eliminado por el recolector de basura.
let mainWindow;
let tray = null;

// Versión de la aplicación
const appVersion = app.getVersion();

// Determinar si estamos en modo desarrollo
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  // Crear la ventana del navegador.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/raw.ico'),
    show: false, // No mostrar hasta que esté listo
    backgroundColor: '#1e1e2e' // Color de fondo oscuro mientras carga
  });

  // URL de carga corregida
  const startUrl = isDev
    ? 'http://localhost:5173' // Puerto por defecto de Vite
    : `file://${path.join(__dirname, '../dist/index.html')}#/`; // Añadido #/

  mainWindow.loadURL(startUrl);

  // Mostrar la ventana cuando esté lista
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Abrir DevTools en modo desarrollo
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Crear la bandeja del sistema
  createTray();

  // Emitido cuando la ventana es cerrada.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Manejar cuando el usuario intenta cerrar la ventana
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

// Crear ícono en la bandeja del sistema
function createTray() {
  const iconPath = path.join(__dirname, '../public/favicon.ico');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Abrir Dogito Chat', 
      click: () => {
        if (mainWindow === null) {
          createWindow();
        } else {
          mainWindow.show();
        }
      } 
    },
    {
      label: `Versión ${appVersion}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Buscar actualizaciones',
      click: () => {
        autoUpdater.checkForUpdatesAndNotify();
      }
    },
    { type: 'separator' },
    { 
      label: 'Salir', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip(`Dogito Chat v${appVersion}`);
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
}

// Configurar eventos de actualización automática
function setupAutoUpdater() {
  // Silenciar errores de actualización en desarrollo
  if (isDev) {
    autoUpdater.autoDownload = false;
    return;
  }

  // Verificar actualizaciones cada 60 minutos
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  // Verificar actualizaciones al inicio
  autoUpdater.checkForUpdatesAndNotify();

  // Cuando hay una actualización disponible
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', info);
    
    // También mostrar una notificación nativa
    const notification = new Notification({
      title: '¡Actualización disponible!',
      body: `La versión ${info.version} está disponible y se descargará automáticamente.`
    });
    notification.show();
  });

  // Cuando la actualización se ha descargado
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-downloaded', info);
    
    // Preguntar al usuario si quiere instalar ahora o después
    dialog.showMessageBox({
      type: 'info',
      title: 'Actualización lista para instalar',
      message: `La versión ${info.version} ha sido descargada. ¿Instalar ahora?`,
      buttons: ['Instalar ahora', 'Instalar después']
    }).then((buttonIndex) => {
      if (buttonIndex.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  // Error en la actualización
  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-error', err);
    autoUpdater.logger.error(`Error en la actualización: ${err.toString()}`);
  });
}

// Este método será llamado cuando Electron haya terminado
// la inicialización y esté listo para crear ventanas del navegador.
app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  
  app.on('activate', () => {
    // En macOS es común volver a crear una ventana en la aplicación cuando el
    // icono del dock es clicado y no hay otras ventanas abiertas.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Salir cuando todas las ventanas estén cerradas, excepto en macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Manejar notificaciones nativas
ipcMain.on('notification', (_, { title, body }) => {
  const notification = new Notification({ 
    title, 
    body,
    icon: path.join(__dirname, '../public/favicon.ico')
  });
  
  notification.show();
  
  notification.on('click', () => {
    // Cuando el usuario hace clic en la notificación
    if (mainWindow) {
      // Asegurarse de que la ventana sea visible
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      
      // Traer la ventana al frente
      mainWindow.focus();
      
      // Notificar al proceso de renderizado que se hizo clic en la notificación
      mainWindow.webContents.send('notification-clicked');
    }
  });
});

// Evento para cuando se hace clic en una notificación (para navegación)
ipcMain.on('navigate-to', (_, route) => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('navigate-to-route', route);
  }
});

// Responder con la versión de la aplicación cuando se solicita
ipcMain.on('get-app-version', (event) => {
  event.sender.send('app-version', app.getVersion());
});
  
// Manejar eventos de conexión
ipcMain.on('online-status-changed', (_, status) => {
  console.log('Estado de conexión:', status);
});

// Manejar solicitud de instalación de actualización desde el renderer
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});