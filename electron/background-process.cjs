const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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
      const shouldClose = dialog.showMessageBoxSync(mainWindow, {
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
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  }

  // Evento para restaurar desde IPC
  ipcMain.on('restore-window', () => {
    restoreWindow();
  });

  // Función para crear la bandeja del sistema con más opciones
  function createTrayMenu(window) {
    try {
      log.info("⏳ Iniciando creación del tray desde background-process...");
      
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
        
        // Intentar usar un icono de la app
        try {
          // Si la app tiene un icono, podríamos usarlo como fallback
          if (app.getAppPath()) {
            iconPath = app.getAppPath();
            log.info(`✅ Usando directorio de la app como último recurso: ${iconPath}`);
          } else {
            throw new Error("No hay ruta de aplicación disponible");
          }
        } catch (err) {
          log.error(`❌ Error al usar ruta de app: ${err.message}`);
          return null; // No podemos crear el tray sin un ícono
        }
      }

      // Crear el tray con el icono encontrado
      log.info(`🔨 Creando tray con icono: ${iconPath}`);
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
      
      log.info("🟢 Tray creado exitosamente desde background-process");
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