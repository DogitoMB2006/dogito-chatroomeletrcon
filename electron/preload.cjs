const { contextBridge, ipcRenderer } = require('electron');

// Almacenar rutas de navegación para notificaciones
let pendingNavigationRoutes = {};

// Exponer APIs protegidas al proceso de renderizado
contextBridge.exposeInMainWorld('electronAPI', {
  // Enviar una notificación nativa
  sendNotification: (title, body) => {
    ipcRenderer.send('notification', { title, body });
  },

  // Activar apertura de la app cuando se hace clic en una notificación
  onNotificationClick: (callback) => {
    ipcRenderer.on('notification-clicked', (event) => {
      callback(event, pendingNavigationRoutes);
      pendingNavigationRoutes = {};
    });
  },

  // Navegar a una ruta específica
  navigateTo: (route) => {
    pendingNavigationRoutes = { route };
    ipcRenderer.send('navigate-to', route);
  },

  // Informar sobre cambios en el estado de la conexión
  setOnlineStatus: (status) => {
    ipcRenderer.send('online-status-changed', status);
  },

  // Verificar si la app se está ejecutando en modo de desarrollo
  isDev: process.env.NODE_ENV === 'development',

  // Obtener información del sistema
  getAppInfo: () => {
    return {
      appName: 'Dogito Chat',
      appVersion: process.env.npm_package_version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform
    };
  },

  // Funciones relacionadas con actualizaciones
  updates: {
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update-available', callback);
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update-downloaded', callback);
    },
    onUpdateError: (callback) => {
      ipcRenderer.on('update-error', callback);
    },
    installUpdate: () => {
      ipcRenderer.send('install-update');
    },
    checkForUpdates: () => {
      ipcRenderer.send('check-for-updates');
    }
  },

  // Escuchar evento cuando el usuario da clic en "Ver actualizaciones" del menú
  onManualCheckForUpdates: (callback) => {
    ipcRenderer.on('checking-for-updates', callback);
  }
});

// Obtener información de versión desde el proceso principal
ipcRenderer.send('get-app-version');
ipcRenderer.on('app-version', (_, version) => {
  if (window.electronAPI && window.electronAPI.getAppInfo) {
    const appInfo = window.electronAPI.getAppInfo();
    appInfo.appVersion = version;
  }
});

// Escuchar navegación desde el proceso principal
ipcRenderer.on('navigate-to-route', (_, route) => {
  document.dispatchEvent(new CustomEvent('electron-navigate', {
    detail: { route }
  }));
});

// Detectar cuando se activa "Ver actualizaciones" desde el menú
ipcRenderer.on('checking-for-updates', () => {
  document.dispatchEvent(new CustomEvent('electron-checking-updates'));
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script ha sido cargado');
});
