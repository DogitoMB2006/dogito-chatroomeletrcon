const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

console.log("🟢 Preload script ejecutado correctamente");

// Función para verificar que estamos ejecutando en Electron
function isElectron() {
  return window && window.process && window.process.type;
}

// API segura para exponer a la ventana del navegador
contextBridge.exposeInMainWorld('electronAPI', {
  // Notificaciones
  notifications: {
    send: (title, body) => {
      if (isElectron()) {
        ipcRenderer.send('notification', { title, body });
      } else {
        console.warn('Función de notificación no disponible fuera de Electron');
      }
    },
    onClicked: (callback) => {
      if (isElectron()) {
        const handler = () => callback();
        ipcRenderer.on('notification-clicked', handler);
        return () => ipcRenderer.removeListener('notification-clicked', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    }
  },
  
  // Método para restaurar la ventana explícitamente (para notificaciones)
  restoreWindow: () => {
    if (isElectron()) {
      ipcRenderer.send('restore-window');
      return true;
    }
    return false;
  },
  
  // Método único para enviar notificaciones (más consistente)
  sendNotification: (title, body, payload = null) => {
    if (isElectron()) {
      // Enviar el título, cuerpo y payload adicional con la ruta de navegación
      ipcRenderer.send('notification', { title, body, payload });
      
      // Devolver un objeto con métodos adicionales
      return {
        // Método para abrir explícitamente la ventana cuando se muestra la notificación
        restoreWindowOnClick: () => {
          console.log("Configurando restauración automática al hacer clic en notificación");
          const unsubscribe = ipcRenderer.once('notification-clicked', () => {
            console.log("Notificación clickeada, restaurando ventana...");
            ipcRenderer.send('restore-window');
          });
          return unsubscribe;
        }
      };
    } else {
      console.warn('Función de notificación no disponible fuera de Electron');
      return { restoreWindowOnClick: () => {} };
    }
  },
  
  // También podemos mejorar el método onNotificationClick para incluir la restauración
  onNotificationClick: (callback) => {
    if (isElectron()) {
      // Este manejador ahora hace dos cosas:
      // 1. Restaura la ventana automáticamente
      // 2. Llama al callback proporcionado
      const handler = (_, payload) => {
        // Primero restauramos la ventana
        ipcRenderer.send('restore-window');
        // Luego llamamos al callback con el payload
        callback(_, payload);
      };
      ipcRenderer.on('notification-clicked', handler);
      return () => ipcRenderer.removeListener('notification-clicked', handler);
    }
    return () => {}; // Función vacía para entornos no-Electron
  },
  
  // Navegación
  navigation: {
    navigateTo: (route) => {
      if (isElectron()) {
        ipcRenderer.send('navigate-to', route);
      } else {
        console.warn('Función de navegación no disponible fuera de Electron');
      }
    },
    onNavigateTo: (callback) => {
      if (isElectron()) {
        const handler = (_, route) => callback(route);
        ipcRenderer.on('navigate-to-route', handler);
        return () => ipcRenderer.removeListener('navigate-to-route', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    }
  },
  
  // Funciones de online/offline
  setOnlineStatus: (status) => {
    if (isElectron()) {
      ipcRenderer.send('online-status-changed', status ? 'online' : 'offline');
    }
  },
  
  // Información de la aplicación
  isDev: process.env.NODE_ENV === 'development',
  
  getAppInfo: () => {
    if (isElectron()) {
      return {
        appVersion: ipcRenderer.sendSync('get-app-version'),
        platform: process.platform
      };
    } else {
      return {
        appVersion: '0.0.0-dev',
        platform: 'web'
      };
    }
  },
  
  // Eventos manuales de actualización
  onManualCheckForUpdates: (callback) => {
    if (isElectron()) {
      const handler = () => callback();
      ipcRenderer.on('manual-check-updates', handler);
      return () => ipcRenderer.removeListener('manual-check-updates', handler);
    }
    return () => {};
  },
  
  // Sistema de actualizaciones
  updates: {
    // Acciones
    checkForUpdates: () => {
      if (isElectron()) {
        console.log("📣 Frontend solicitando verificación de actualizaciones");
        ipcRenderer.send('check-for-updates');
      } else {
        console.warn('Función de actualización no disponible fuera de Electron');
      }
    },
    installUpdate: () => {
      if (isElectron()) {
        console.log("📣 Frontend solicitando instalación de actualización");
        ipcRenderer.send('install-update');
      } else {
        console.warn('Función de actualización no disponible fuera de Electron');
      }
    },
    
    // Eventos
    onCheckingForUpdates: (callback) => {
      if (isElectron()) {
        const handler = () => callback();
        ipcRenderer.on('checking-for-updates', handler);
        return () => ipcRenderer.removeListener('checking-for-updates', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    },
    onUpdateAvailable: (callback) => {
      if (isElectron()) {
        const handler = (_, info) => callback(info);
        ipcRenderer.on('update-available', handler);
        return () => ipcRenderer.removeListener('update-available', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    },
    onUpdateNotAvailable: (callback) => {
      if (isElectron()) {
        const handler = () => callback();
        ipcRenderer.on('update-not-available', handler);
        return () => ipcRenderer.removeListener('update-not-available', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    },
    onUpdateDownloaded: (callback) => {
      if (isElectron()) {
        const handler = (_, info) => callback(info);
        ipcRenderer.on('update-downloaded', handler);
        return () => ipcRenderer.removeListener('update-downloaded', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    },
    onUpdateProgress: (callback) => {
      if (isElectron()) {
        const handler = (_, progressObj) => callback(progressObj);
        ipcRenderer.on('update-progress', handler);
        return () => ipcRenderer.removeListener('update-progress', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    },
    onUpdateError: (callback) => {
      if (isElectron()) {
        const handler = (_, error) => callback(error);
        ipcRenderer.on('update-error', handler);
        return () => ipcRenderer.removeListener('update-error', handler);
      }
      return () => {}; // Función vacía para entornos no-Electron
    }
  }
});

// Informar al proceso principal sobre el estado de conexión
if (isElectron()) {
  window.addEventListener('online', () => {
    ipcRenderer.send('online-status-changed', 'online');
  });

  window.addEventListener('offline', () => {
    ipcRenderer.send('online-status-changed', 'offline');
  });
}