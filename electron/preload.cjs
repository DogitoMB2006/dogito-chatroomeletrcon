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
  
  // Información de la aplicación
  app: {
    getVersion: () => {
      if (isElectron()) {
        ipcRenderer.send('get-app-version');
        return new Promise((resolve) => {
          ipcRenderer.once('app-version', (_, version) => resolve(version));
        });
      } else {
        return Promise.resolve('0.0.0-dev'); // Versión por defecto para desarrollo web
      }
    }
  },
  
  // Sistema de actualizaciones
  updates: {
    // Acciones
    checkForUpdates: () => {
      if (isElectron()) {
        ipcRenderer.send('check-for-updates');
      } else {
        console.warn('Función de actualización no disponible fuera de Electron');
      }
    },
    installUpdate: () => {
      if (isElectron()) {
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