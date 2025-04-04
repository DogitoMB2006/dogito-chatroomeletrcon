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
      pendingNavigationRoutes = {}; // Limpiar rutas pendientes después de navegar
    });
  },
  
  // Navegar a una ruta específica
  navigateTo: (route) => {
    pendingNavigationRoutes = { route }; // Almacenar la ruta para cuando se haga clic
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
    // Escuchar eventos de actualización
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update-available', callback);
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update-downloaded', callback);
    },
    onUpdateError: (callback) => {
      ipcRenderer.on('update-error', callback);
    },
    // Instalar actualización
    installUpdate: () => {
      ipcRenderer.send('install-update');
    },
    // Verificar actualizaciones manualmente
    checkForUpdates: () => {
      ipcRenderer.send('check-for-updates');
    }
  }
});

// Obtener información de versión desde el proceso principal
ipcRenderer.send('get-app-version');
ipcRenderer.on('app-version', (_, version) => {
  // Actualizar versión cuando se reciba desde el proceso principal
  if (window.electronAPI && window.electronAPI.getAppInfo) {
    const appInfo = window.electronAPI.getAppInfo();
    appInfo.appVersion = version;
  }
});

// Manejar eventos de navegación desde el proceso principal
ipcRenderer.on('navigate-to-route', (_, route) => {
  // Esta función será utilizada por el código de la aplicación para navegar
  // Un listener en la aplicación debería escuchar un evento personalizado para manejar esto
  document.dispatchEvent(new CustomEvent('electron-navigate', { 
    detail: { route } 
  }));
});

// Notificar que la aplicación está lista
window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script ha sido cargado');
});