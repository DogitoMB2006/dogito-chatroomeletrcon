const { app, BrowserWindow, ipcMain, Notification, Menu, Tray, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Configuración de registros para actualizaciones
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;
let tray = null;
const appVersion = app.getVersion();
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
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
    show: false,
    backgroundColor: '#1e1e2e'
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}#/`;

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  createTray();
  createAppMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

// ✅ MENÚ SUPERIOR PERSONALIZADO (con Ver actualizaciones)
function createAppMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Ver actualizaciones',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify();
            if (mainWindow) {
              mainWindow.webContents.send('checking-for-updates');
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

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

function setupAutoUpdater() {
  if (isDev) {
    autoUpdater.autoDownload = false;
    return;
  }

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', info);
    const notification = new Notification({
      title: '¡Actualización disponible!',
      body: `La versión ${info.version} está disponible y se descargará automáticamente.`
    });
    notification.show();
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-downloaded', info);

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

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-error', err);
    autoUpdater.logger.error(`Error en la actualización: ${err.toString()}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('notification', (_, { title, body }) => {
  const notification = new Notification({
    title,
    body,
    icon: path.join(__dirname, '../public/favicon.ico')
  });

  notification.show();

  notification.on('click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
      mainWindow.webContents.send('notification-clicked');
    }
  });
});

ipcMain.on('navigate-to', (_, route) => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('navigate-to-route', route);
  }
});

ipcMain.on('get-app-version', (event) => {
  event.sender.send('app-version', app.getVersion());
});

ipcMain.on('online-status-changed', (_, status) => {
  console.log('Estado de conexión:', status);
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});
