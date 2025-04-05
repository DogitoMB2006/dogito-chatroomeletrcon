const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');

function setupBackgroundProcess(mainWindow) {
  // Configuración de comportamiento de segundo plano
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
    args: []
  });

  // Configuración de cierre en segundo plano
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      
      // Mostrar un diálogo para confirmar el cierre
      const shouldClose = require('electron').dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Minimizar', 'Salir'],
        title: 'Dogito Chat',
        message: '¿Qué deseas hacer con la aplicación?',
        defaultId: 0,
        cancelId: 1
      });

      if (shouldClose === 0) {
        // Minimizar a la bandeja del sistema
        mainWindow.hide();
        return false;
      } else {
        // Cerrar completamente
        app.isQuitting = true;
        app.quit();
      }
    }
  });

  // Manejar la restauración de la ventana desde la bandeja del sistema
  function restoreWindow() {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  }

  // Evento para restaurar desde IPC
  ipcMain.on('restore-window', () => {
    restoreWindow();
  });

  // Prevenir múltiples instancias de la aplicación
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    log.warn('Otra instancia ya está corriendo. Cerrando esta instancia.');
    app.quit();
    return;
  }

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Alguien intentó ejecutar una segunda instancia
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Función para crear la bandeja del sistema con más opciones
  function createTrayMenu(window) {
    try {
      const iconPath = path.join(__dirname, '../public/raw.ico');
      const tray = new Tray(iconPath);

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Abrir Dogito Chat',
          click: () => restoreWindow()
        },
        {
          label: 'Cerrar a la bandeja',
          click: () => window.hide()
        },
        { type: 'separator' },
        {
          label: 'Salir completamente',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]);

      tray.setToolTip('Dogito Chat');
      tray.setContextMenu(contextMenu);

      tray.on('click', () => restoreWindow());

      return tray;
    } catch (error) {
      log.error('Error creando bandeja del sistema:', error);
      return null;
    }
  }

  // Exportar funciones útiles
  return {
    createTrayMenu,
    restoreWindow
  };
}

module.exports = {
  setupBackgroundProcess
};