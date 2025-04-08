const { app, BrowserWindow, ipcMain, Notification, Menu, Tray, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { setupBackgroundProcess } = require('./background-process.cjs');
const fs = require('fs');
console.log("🟢 main.cjs cargado correctamente desde Electron");

// Configuración mejorada de logger
const log = require('electron-log');
log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow;
let tray = null;
let updatesWindow = null;
let backgroundProcess = null; // Referencia al proceso en segundo plano
let updateInfo = {
  lastCheck: null,
  updateStatus: 'up-to-date',
  updateData: null
};
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

  // Configurar el proceso en segundo plano
  backgroundProcess = setupBackgroundProcess(mainWindow);
  log.info("🟢 Proceso en segundo plano configurado");

  // Crear el tray después de que la app esté lista
  app.whenReady().then(() => {
    createTray();
    log.info("Tray creation scheduled after app is ready");
  });
  
  createAppMenu();

  // Ya no necesitamos el handler de 'close' aquí, se maneja en background-process
  // Solo mantenemos el evento 'closed'
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Si por alguna razón no tenemos background-process, mantenemos el comportamiento original
  if (!backgroundProcess) {
    mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
        return false;
      }
    });
  }
}

// Función para crear la ventana de actualizaciones
function createUpdatesWindow() {
  // Si la ventana ya existe, solo mostrarla
  if (updatesWindow) {
    updatesWindow.show();
    return;
  }

  // Crear una nueva ventana
  updatesWindow = new BrowserWindow({
    width: 500,
    height: 550,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: false,
    show: false,
    icon: path.join(__dirname, '../public/raw.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'updater-preload.cjs')
    },
    backgroundColor: '#1e1e2e',
    title: 'Actualizaciones de Dogito Chat'
  });

  // Cargar el HTML
  const updatesPath = isDev
    ? `file://${path.join(app.getAppPath(), 'public/updates.html')}`
    : `file://${path.join(app.getAppPath(), 'dist/updates.html')}`;

  updatesWindow.loadURL(updatesPath);
  
  // AÑADIR AQUÍ: Event handler para cuando la página termina de cargar
  updatesWindow.webContents.on('did-finish-load', () => {
    log.info("🔍 Ventana de actualizaciones cargada");
    
    // Verificar que la ventana aún existe (podría haberse cerrado mientras se cargaba)
    if (!updatesWindow) return;
    
    // Enviar evento con información actualizada
    try {
      const info = {
        currentVersion: getCurrentVersion(),
        lastCheck: updateInfo.lastCheck,
        updateStatus: updateInfo.updateStatus,
        updateData: updateInfo.updateData
      };
      log.info("🔍 Enviando información a ventana de actualizaciones:", info);
      updatesWindow.webContents.send('updater-info', info);
    } catch (err) {
      log.error("Error al enviar información inicial a ventana de actualizaciones:", err);
    }
  });
  
  if (isDev) {
    updatesWindow.webContents.openDevTools({ mode: 'detach' });
  }
  
  // No mostrar menú en la ventana de actualizaciones
  updatesWindow.setMenu(null);

  // Mostrar cuando esté lista
  updatesWindow.once('ready-to-show', () => {
    updatesWindow.show();
  });

  // Limpiar la referencia cuando se cierre
  updatesWindow.on('closed', () => {
    updatesWindow = null;
  });

  return updatesWindow;
}

function createAppMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Recargar sitio web',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reload();
            }
          }
        },
        {
          label: 'Forzar reinicio',
          click: () => {
            if (mainWindow) {
              // Usar reloadIgnoringCache para forzar una recarga completa
              mainWindow.webContents.reloadIgnoringCache();
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Ver actualizaciones',
          click: () => {
            createUpdatesWindow();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu); // Establecer nuestro menú personalizado
}

// Función mejorada para crear el tray
function createTray() {
  try {
    log.info("⏳ Iniciando creación del tray...");
    
    // Si ya existe un tray, no crear uno nuevo
    if (tray !== null) {
      log.info("⚠️ Tray ya existe, no se creará uno nuevo");
      return;
    }
    
    // Lista de posibles rutas de iconos - MEJORADA y más robusta
    const possibleIconPaths = [
      // Rutas en producción
      path.join(app.getAppPath(), 'dist/favicon.ico'),
      path.join(app.getAppPath(), 'dist/raw.ico'),
      path.join(app.getAppPath(), 'dist/icon.ico'),
      path.join(app.getAppPath(), 'dist/icon.png'),
      // Rutas de recursos en producción
      path.join(app.getAppPath(), 'build/favicon.ico'),
      path.join(app.getAppPath(), 'build/raw.ico'),
      path.join(app.getAppPath(), 'build/icon.ico'),
      path.join(app.getAppPath(), 'build/icon.png'),
      // Rutas en desarrollo
      path.join(app.getAppPath(), 'public/favicon.ico'),
      path.join(app.getAppPath(), 'public/raw.ico'),
      path.join(app.getAppPath(), 'public/icon.ico'),
      path.join(app.getAppPath(), 'public/icon.png'),
      // Rutas relativas
      path.join(__dirname, '../public/favicon.ico'),
      path.join(__dirname, '../public/raw.ico'),
      path.join(__dirname, '../public/icon.ico'),
      path.join(__dirname, '../public/icon.png'),
      // Rutas absolutas
      path.join(__dirname, 'public/favicon.ico'),
      path.join(__dirname, 'public/raw.ico'),
      path.join(__dirname, 'public/icon.ico'),
      path.join(__dirname, 'public/icon.png'),
      // Recursos
      path.join(__dirname, '../resources/favicon.ico'),
      path.join(__dirname, '../resources/raw.ico'),
      path.join(__dirname, '../resources/icon.ico'),
      path.join(__dirname, '../resources/icon.png'),
    ];

    // Encontrar el primer icono válido
    let iconPath = null;
    
    // Debug: mostrar rutas de búsqueda
    log.info(`📁 Buscando iconos en ${possibleIconPaths.length} rutas posibles...`);
    
    for (const p of possibleIconPaths) {
      log.info(`📁 Verificando: ${p}`);
      
      try {
        if (fs.existsSync(p)) {
          iconPath = p;
          log.info(`✅ Icono encontrado en: ${p}`);
          break;
        }
      } catch (err) {
        log.warn(`⚠️ Error verificando ruta ${p}: ${err.message}`);
      }
    }

    // Si no se encontró ningún icono, usar un icono genérico
    if (!iconPath) {
      log.warn("⚠️ No se encontró ningún icono para la bandeja del sistema");
      
      // En modo desarrollo, podemos usar un icono de Electron
      if (isDev) {
        const electronIconPath = path.join(require.resolve('electron'), '..', '..', 'dist', 'electron.ico');
        if (fs.existsSync(electronIconPath)) {
          iconPath = electronIconPath;
          log.info(`✅ Usando icono de Electron: ${electronIconPath}`);
        }
      }
      
      // Si todavía no tenemos un icono, intentar usar un recurso interno
      if (!iconPath) {
        iconPath = app.getFileIcon ? app.getFileIcon(app.getPath('exe')) : null;
        if (iconPath) {
          log.info(`✅ Usando icono de la aplicación`);
        } else {
          // Si todo falla, no crear tray
          log.error("❌ No se pudo encontrar ningún icono válido para la bandeja");
          return;
        }
      }
    }

    // Crear la bandeja con el icono encontrado
    log.info(`🔨 Creando tray con icono: ${iconPath}`);
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Dogito Chat',
        click: () => {
          if (mainWindow === null) {
            createWindow();
          } else {
            // Usar la función de restauración del background-process si está disponible
            if (backgroundProcess && backgroundProcess.restoreWindow) {
              backgroundProcess.restoreWindow();
            } else {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.show();
              mainWindow.focus();
            }
          }
        }
      },
      {
        label: `Versión ${getCurrentVersion()}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Buscar actualizaciones',
        click: () => {
          // Primero abrir la ventana, luego verificar actualizaciones
          createUpdatesWindow();
          setTimeout(() => checkForUpdates(true), 500);
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

    tray.setToolTip(`Dogito Chat v${getCurrentVersion()}`);
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow === null) {
        createWindow();
      } else {
        // Usar la función de restauración del background-process si está disponible
        if (backgroundProcess && backgroundProcess.restoreWindow) {
          backgroundProcess.restoreWindow();
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
    
    log.info("🟢 Bandeja del sistema creada con éxito");
  } catch (error) {
    log.error("❌ Error al crear la bandeja del sistema:", error);
    // Continuar sin la bandeja del sistema
  }
}

// Función para obtener la versión actual de manera consistente
function getCurrentVersion() {
  try {
    // Primero intenta obtener la versión desde package.json
    const packageJsonPath = path.join(app.getAppPath(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.version && packageJson.version !== '0.0.0') {
        return packageJson.version;
      }
    }
    
    // Si no, usa la versión de la app
    const version = app.getVersion();
    return version !== '0.0.0' ? version : '1.1.3';
  } catch (error) {
    log.error("Error al obtener versión:", error);
    return '1.1.3'; // Fallback definitivo
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
  
  // Actualizar la información de la última verificación
  updateInfo = {
    lastCheck: new Date().toISOString(),
    updateStatus: 'checking',
    updateData: null
  };
  
  try {
    // Notificar al frontend que estamos verificando
    if (mainWindow) {
      // Si es una verificación manual, enviar evento especial
      if (manual) {
        mainWindow.webContents.send('manual-check-updates');
      }
      mainWindow.webContents.send('checking-for-updates');
    }
    
    // Notificar a la ventana de actualizaciones si existe
    if (updatesWindow) {
      updatesWindow.webContents.send('checking-for-updates');
    }
    
    // Si estamos en desarrollo, mostrar un mensaje de prueba
    if (isDev) {
      log.info("⚠️ Modo desarrollo: simulando verificación/descarga de actualizaciones");
      
      // Simular evento de actualización disponible después de 2 segundos
      setTimeout(() => {
        const fakeUpdateInfo = {
          version: '999.0.0',
          releaseDate: new Date().toISOString(),
          releaseNotes: 'Esta es una actualización simulada para probar la interfaz. Incluye:\n\n- Nuevas características\n- Corrección de errores\n- Mejoras de rendimiento'
        };
        
        // Actualizar información
        updateInfo = {
          lastCheck: new Date().toISOString(),
          updateStatus: 'available',
          updateData: fakeUpdateInfo
        };
        
        // Notificar ventanas
        if (mainWindow) {
          mainWindow.webContents.send('update-available', fakeUpdateInfo);
        }
        if (updatesWindow) {
          updatesWindow.webContents.send('update-available', fakeUpdateInfo);
        }
        
        // Simular progreso de descarga
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += 10;
          const progressData = {
            percent: progress,
            bytesPerSecond: 1000000,
            total: 90000000,
            transferred: progress * 900000
          };
          
          // Actualizar información
          updateInfo = {
            ...updateInfo,
            updateStatus: 'downloading',
            updateData: {
              ...updateInfo.updateData,
              progress: progressData
            }
          };
          
          // Notificar ventanas
          if (mainWindow) {
            mainWindow.webContents.send('update-progress', progressData);
          }
          if (updatesWindow) {
            updatesWindow.webContents.send('update-progress', progressData);
          }
          
          if (progress >= 100) {
            clearInterval(progressInterval);
            
            // Simular actualización descargada
            setTimeout(() => {
              // Actualizar información
              updateInfo = {
                lastCheck: new Date().toISOString(),
                updateStatus: 'downloaded',
                updateData: fakeUpdateInfo
              };
              
              // Notificar ventanas
              if (mainWindow) {
                mainWindow.webContents.send('update-downloaded', fakeUpdateInfo);
              }
              if (updatesWindow) {
                updatesWindow.webContents.send('update-downloaded', fakeUpdateInfo);
              }
            }, 1000);
          }
        }, 1000);
      }, 2000);
      
      return;
    }
    
    // En producción, verificar normalmente
    autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("❌ Error al iniciar verificación de actualizaciones:", error);
    
    // Actualizar información
    updateInfo = {
      lastCheck: new Date().toISOString(),
      updateStatus: 'error',
      updateData: { error: error }
    };
    
    // Notificar ventanas
    if (mainWindow) {
      mainWindow.webContents.send('update-error', { message: error.message });
    }
    if (updatesWindow) {
      updatesWindow.webContents.send('update-error', { message: error.message });
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
    
    // Actualizar información
    updateInfo = {
      lastCheck: new Date().toISOString(),
      updateStatus: 'checking',
      updateData: null
    };
    
    // Notificar ventanas
    if (mainWindow) {
      mainWindow.webContents.send('checking-for-updates');
    }
    if (updatesWindow) {
      updatesWindow.webContents.send('checking-for-updates');
    }
  });

  autoUpdater.on('update-available', (info) => {
    log.info("📦 Update available:", info);
    
    // Actualizar información
    updateInfo = {
      lastCheck: new Date().toISOString(),
      updateStatus: 'available',
      updateData: info
    };
    
    // Notificar ventanas
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
    if (updatesWindow) {
      updatesWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info("✅ No hay actualizaciones disponibles.");
    
    // Actualizar información
    updateInfo = {
      lastCheck: new Date().toISOString(),
      updateStatus: 'up-to-date',
      updateData: null
    };
    
    // Notificar ventanas
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available');
    }
    if (updatesWindow) {
      updatesWindow.webContents.send('update-not-available');
    }
  });

  autoUpdater.on('error', (err) => {
    log.error("❌ Error al buscar actualizaciones:", err);
    
    // Actualizar información
    updateInfo = {
      lastCheck: new Date().toISOString(),
      updateStatus: 'error',
      updateData: { error: err }
    };
    
    // Notificar ventanas
    if (mainWindow) {
      mainWindow.webContents.send('update-error', { message: err.message });
    }
    if (updatesWindow) {
      updatesWindow.webContents.send('update-error', { message: err.message });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    log.info(`⏳ Progreso de descarga: ${progressObj.percent.toFixed(2)}%`);
    
    // Actualizar información
    updateInfo = {
      ...updateInfo,
      updateStatus: 'downloading',
      updateData: {
        ...updateInfo.updateData,
        progress: progressObj
      }
    };
    
    // Notificar ventanas
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', progressObj);
    }
    if (updatesWindow) {
      updatesWindow.webContents.send('update-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info("⬇️ Update descargada:", info);
    
    // Actualizar información
    updateInfo = {
      lastCheck: new Date().toISOString(),
      updateStatus: 'downloaded',
      updateData: info
    };
    
    // Notificar ventanas
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
    if (updatesWindow) {
      updatesWindow.webContents.send('update-downloaded', info);
    }
    
    // Dialog opcional
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
  });
}

// INICIO PRINCIPAL DE LA APP - MODIFICADO PARA QUE FUNCIONE MEJOR
app.whenReady().then(() => {
  // Prevenir múltiples instancias (parte del código de background-process integrado aquí)
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    log.warn("Otra instancia ya está corriendo. Cerrando esta instancia.");
    app.quit();
    return;
  }

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Alguien intentó ejecutar una segunda instancia
    if (mainWindow) {
      if (backgroundProcess && backgroundProcess.restoreWindow) {
        backgroundProcess.restoreWindow();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // Crear la ventana principal
  createWindow();
  
  // Configurar el auto updater
  setupAutoUpdater();
  
  // Crear el tray DESPUÉS de que la app esté lista
  setTimeout(() => {
    createTray();
    log.info("🚀 Tray creation triggered after timeout");
  }, 1000);  

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Manejar eventos del ciclo de vida de la app
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    log.info("Todas las ventanas cerradas - pero manteniéndose en system tray");
    // NO llamamos a app.quit() aquí para mantener la app en segundo plano con el tray
  }
});

app.on('before-quit', () => {
  log.info("App cerrándose completamente");
  app.isQuitting = true;
});

app.on('quit', () => {
  log.info("App cerrada completamente");
  // Limpiar el tray al salir completamente
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

ipcMain.on('get-app-version', (event) => {
  event.returnValue = getCurrentVersion();
});

// Método explícito para obtener la versión de manera asíncrona
ipcMain.handle('get-app-version-async', async () => {
  try {
    return getCurrentVersion();
  } catch (error) {
    log.error("Error al obtener versión:", error);
    return '1.1.3'; // Fallback como último recurso
  }
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

// Nuevos manejadores para la ventana de actualizaciones
ipcMain.on('get-updater-info', (event) => {
  log.info("🔍 Solicitud de información de actualización");
  const info = {
    currentVersion: getCurrentVersion(),
    lastCheck: updateInfo.lastCheck,
    updateStatus: updateInfo.updateStatus,
    updateData: updateInfo.updateData
  };
  log.info("🔍 Información de actualización:", info);
  event.returnValue = info;
});
ipcMain.on('close-updates-window', () => {
  if (updatesWindow) {
    updatesWindow.close();
  }
});

ipcMain.on('notification', (event, { title, body, payload = null }) => {
  log.info(`Mostrando notificación: ${title} - ${body}`);
  if (payload) {
    log.info(`Con payload adicional:`, payload);
  }
  
  try {
    // Verificar que las notificaciones estén soportadas
    if (!Notification.isSupported()) {
      log.warn('Las notificaciones nativas no están soportadas en este sistema');
      return;
    }
    
    // Buscar un ícono apropiado
    let iconPath = null;
    const possiblePaths = [
      path.join(__dirname, '../public/favicon.ico'),
      path.join(__dirname, '../public/raw.ico'),
      path.join(__dirname, '../public/icon.ico'),
      path.join(__dirname, '../public/icon.png'),
      path.join(__dirname, 'public/favicon.ico'),
      path.join(__dirname, 'public/raw.ico')
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        iconPath = p;
        break;
      }
    }
    
    const notification = new Notification({
      title: title || 'Notificación',
      body: body || '',
      icon: iconPath || undefined,
      silent: false // Hacer que suene
    });
    
    notification.show();
    
    // Evento cuando se hace clic en la notificación
    notification.on('click', () => {
      // Mostrar y enfocar la ventana principal
      if (mainWindow) {
        // Usar la función de restauración del background-process si está disponible
        if (backgroundProcess && backgroundProcess.restoreWindow) {
          backgroundProcess.restoreWindow();
        } else {
          if (!mainWindow.isVisible()) {
            mainWindow.show();
          }
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.focus();
        }
        
        // Enviar el evento a la ventana del navegador, INCLUYENDO EL PAYLOAD
        mainWindow.webContents.send('notification-clicked', payload);
        
        // Responder al evento para que el remitente sepa que fue procesado
        if (event.sender) {
          event.sender.send('notification-clicked-response', { success: true, payload });
        }
      }
    });
  } catch (error) {
    log.error("❌ Error al mostrar notificación:", error);
    
    // Informar del error
    if (event.sender) {
      event.sender.send('notification-error', { error: error.message });
    }
  }
});

ipcMain.on('navigate-to', (_, route) => {
  if (mainWindow) {
    // Usar la función de restauración del background-process si está disponible
    if (backgroundProcess && backgroundProcess.restoreWindow) {
      backgroundProcess.restoreWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
    mainWindow.webContents.send('navigate-to-route', route);
  }
});

// Agregar manejador para restaurar la ventana desde otros procesos
ipcMain.on('restore-window', () => {
  if (backgroundProcess && backgroundProcess.restoreWindow) {
    backgroundProcess.restoreWindow();
  } else if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

