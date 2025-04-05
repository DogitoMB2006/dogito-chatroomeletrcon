const { app, BrowserWindow, ipcMain, Notification, Menu, Tray, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
console.log("🟢 main.cjs cargado correctamente desde Electron");

// Configuración mejorada de logger
const log = require('electron-log');
log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow;
let tray = null;
const appVersion = app.getVersion();
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  // ❌ Eliminar menú predeterminado de Electron ANTES de crear la ventana
  Menu.setApplicationMenu(null);

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
            checkForUpdates(true);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu); // Establecer nuestro menú personalizado
}

function createTray() {
  try {
    // Intenta con varias rutas posibles para el icono
    const possiblePaths = [
      path.join(__dirname, '../public/favicon.ico'),
      path.join(__dirname, '../public/raw.ico'),
      path.join(__dirname, '../public/icon.ico'),
      path.join(__dirname, '../public/icon.png'),
      path.join(__dirname, 'public/favicon.ico'),
      path.join(__dirname, 'public/raw.ico')
    ];

    let iconPath = null;
    for (const p of possiblePaths) {
      if (require('fs').existsSync(p)) {
        iconPath = p;
        console.log(`✅ Icono encontrado en: ${p}`);
        break;
      }
    }

    if (!iconPath) {
      console.warn("⚠️ No se encontró ningún icono para la bandeja del sistema");
      
      // En modo desarrollo, podemos simplemente omitir la bandeja del sistema
      if (isDev) {
        console.log("🔵 Modo desarrollo: continuando sin bandeja del sistema");
        return; // Salimos sin crear la bandeja
      }
      
      // En producción, usamos un icono por defecto
      const defaultIconPath = path.join(app.getAppPath(), 'resources', 'icon.png');
      if (require('fs').existsSync(defaultIconPath)) {
        iconPath = defaultIconPath;
        console.log(`✅ Usando icono predeterminado: ${defaultIconPath}`);
      } else {
        console.error("❌ No se pudo encontrar ningún icono válido para la bandeja");
        return; // Salimos sin crear la bandeja
      }
    }

    // Crear la bandeja con el icono encontrado
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
          checkForUpdates(true);
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
  } catch (error) {
    console.error("❌ Error al crear la bandeja del sistema:", error);
    // Continuar sin la bandeja del sistema
  }
}

// Configuración específica para autoUpdater
function configureAutoUpdater() {
  // Configuración de GitHub para el autoupdate
  autoUpdater.autoDownload = !isDev;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  
  // En desarrollo, podemos usar estos parámetros para pruebas
  if (isDev) {
    // Usar estas opciones solo para pruebas en desarrollo
    // autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml');
    autoUpdater.forceDevUpdateConfig = true;
  }
}

// Función unificada para verificar actualizaciones
function checkForUpdates(manual = true) {
  log.info(`🔍 Verificando actualizaciones ${manual ? 'manualmente' : 'automáticamente'}...`);
  
  try {
    // Notificar al frontend que estamos verificando
    if (mainWindow) {
      // Si es una verificación manual, enviar evento especial
      if (manual) {
        mainWindow.webContents.send('manual-check-updates');
      }
      mainWindow.webContents.send('checking-for-updates');
    }
    
    // Si estamos en desarrollo, mostrar un mensaje de prueba
    if (isDev) {
      log.info("⚠️ Modo desarrollo: simulando verificación/descarga de actualizaciones");
      
      // Simular evento de actualización disponible después de 2 segundos
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.send('update-available', {
            version: '999.0.0',
            releaseDate: new Date().toISOString()
          });
          
          // Simular progreso de descarga
          let progress = 0;
          const progressInterval = setInterval(() => {
            progress += 10;
            mainWindow.webContents.send('update-progress', {
              percent: progress,
              bytesPerSecond: 1000000,
              total: 90000000,
              transferred: progress * 900000
            });
            
            if (progress >= 100) {
              clearInterval(progressInterval);
              
              // Simular actualización descargada
              setTimeout(() => {
                mainWindow.webContents.send('update-downloaded', {
                  version: '999.0.0',
                  releaseDate: new Date().toISOString()
                });
              }, 1000);
            }
          }, 1000);
        }
      }, 2000);
      
      return;
    }
    
    // En producción, verificar normalmente
    autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("❌ Error al iniciar verificación de actualizaciones:", error);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', { message: error.message });
    }
  }
}

function setupAutoUpdater() {
  // Primero configurar el autoupdater
  configureAutoUpdater();
  
  if (isDev) {
    log.info("⚠️ Modo DEV: autoUpdater activado pero no descargará automáticamente.");
  } else {
    log.info("✅ Modo PRODUCCIÓN: autoUpdater activado con descarga automática.");
    // Verificar cada hora en producción (sin notificar al usuario)
    setInterval(() => {
      log.info("🔄 Verificando actualizaciones automáticamente...");
      checkForUpdates(false); // false indica verificación automática
    }, 60 * 60 * 1000);

    // Verificar al iniciar (sin notificar al usuario)
    setTimeout(() => {
      checkForUpdates(false);
    }, 10000); // Verificar 10 segundos después del inicio
  }

  // Eventos de actualización
  autoUpdater.on('checking-for-update', () => {
    log.info("🔍 Verificando actualizaciones disponibles...");
    if (mainWindow) {
      mainWindow.webContents.send('checking-for-updates');
    }
  });

  autoUpdater.on('update-available', (info) => {
    log.info("📦 Update available:", info);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info("✅ No hay actualizaciones disponibles.");
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available');
    }
  });

  autoUpdater.on('error', (err) => {
    log.error("❌ Error al buscar actualizaciones:", err);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', { message: err.message });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    log.info(`⏳ Progreso de descarga: ${progressObj.percent.toFixed(2)}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info("⬇️ Update descargada:", info);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
      
      // Opcional: Mostrar diálogo nativo para preguntar al usuario
      dialog.showMessageBox({
        type: 'info',
        title: 'Actualización disponible',
        message: 'Se ha descargado una nueva versión. ¿Desea reiniciar para instalarla?',
        buttons: ['Instalar ahora', 'Más tarde']
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
    }
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

// IPC handlers
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
  event.returnValue = app.getVersion();
});

ipcMain.on('check-for-updates', () => {
  checkForUpdates(true);
});

ipcMain.on('install-update', () => {
  log.info("🔄 Instalando actualización...");
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on('online-status-changed', (_, status) => {
  log.info('Estado de conexión:', status);
});