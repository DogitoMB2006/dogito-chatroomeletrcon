const { contextBridge, ipcRenderer } = require('electron');

console.log("🟢 Preload script para ventana de actualizaciones ejecutado");

// Función para verificar que estamos ejecutando en Electron
function isElectron() {
  return window && window.process && window.process.type;
}

// Función para obtener la versión de la aplicación de manera robusta
function getAppVersion() {
  try {
    // Método 1: Obtener mediante IPC
    const ipcVersion = ipcRenderer.sendSync('get-app-version');
    console.log("Versión obtenida mediante IPC:", ipcVersion);
    if (ipcVersion && ipcVersion !== '0.0.0') {
      return ipcVersion;
    }

    // Método 2: Obtener información completa del updater
    const updaterInfo = ipcRenderer.sendSync('get-updater-info');
    console.log("Información del updater:", updaterInfo);
    if (updaterInfo && updaterInfo.currentVersion && updaterInfo.currentVersion !== '0.0.0') {
      return updaterInfo.currentVersion;
    }

    // Método 3: Fallback - intenta obtener desde process.env
    if (process.env.npm_package_version) {
      console.log("Versión desde process.env:", process.env.npm_package_version);
      return process.env.npm_package_version;
    }

    // Si todo falla, devolvemos un valor por defecto con nota
    return '1.1.3 (fallback)';
  } catch (err) {
    console.error("Error al obtener versión:", err);
    return '1.1.3 (error)';
  }
}

// Función para imprimir información de diagnóstico
function logDiagnostics() {
  try {
    // Verificar si estamos en Electron
    console.log(`✅ Estamos en Electron: ${isElectron()}`);
    
    // Verificar versión de la aplicación directamente
    const directAppVersion = getAppVersion();
    console.log(`✅ Versión directa de la aplicación: ${directAppVersion}`);
    
    // Verificar información de actualizaciones
    try {
      const updaterInfo = ipcRenderer.sendSync('get-updater-info');
      console.log("✅ Información de actualización:", updaterInfo);
    } catch (err) {
      console.error("❌ Error al obtener información de actualización:", err);
    }
  } catch (err) {
    console.error("❌ Error en diagnóstico:", err);
  }
}

// Imprimir información de diagnóstico
logDiagnostics();

// API segura para exponer a la ventana de actualizaciones
contextBridge.exposeInMainWorld('electronAPI', {
  // Obtener información sobre el estado de actualizaciones
  getUpdaterInfo: () => {
    try {
      if (isElectron()) {
        // Obtener la información estándar
        const info = ipcRenderer.sendSync('get-updater-info');
        console.log("Obteniendo información de actualización:", info);
        
        // ¡IMPORTANTE! Si la versión es 0.0.0, reemplazarla con una versión real
        if (!info.currentVersion || info.currentVersion === '0.0.0') {
          info.currentVersion = getAppVersion();
          console.log("Corregida versión a:", info.currentVersion);
        }
        
        return info;
      }
    } catch (err) {
      console.error("Error al obtener información de actualización:", err);
    }
    return {
      currentVersion: getAppVersion(),
      lastCheck: null,
      updateStatus: 'up-to-date',
      updateData: null
    };
  },
  
  // Verificar actualizaciones
  checkForUpdates: () => {
    if (isElectron()) {
      console.log("Solicitando verificación de actualizaciones");
      ipcRenderer.send('check-for-updates');
    }
  },
  
  // Instalar actualización
  installUpdate: () => {
    if (isElectron()) {
      console.log("Solicitando instalación de actualización");
      ipcRenderer.send('install-update');
    }
  },
  
  // Cerrar la ventana
  closeUpdatesWindow: () => {
    if (isElectron()) {
      console.log("Solicitando cierre de ventana");
      ipcRenderer.send('close-updates-window');
    }
  },
  
  // ===== Eventos de actualización =====
  
  // Verificando actualizaciones
  onCheckingForUpdates: (callback) => {
    if (isElectron()) {
      console.log("Registrando evento: checking-for-updates");
      const handler = () => {
        console.log("Evento recibido: checking-for-updates");
        callback();
      };
      ipcRenderer.on('checking-for-updates', handler);
      return () => ipcRenderer.removeListener('checking-for-updates', handler);
    }
    return () => {};
  },
  
  // Actualización disponible
  onUpdateAvailable: (callback) => {
    if (isElectron()) {
      console.log("Registrando evento: update-available");
      const handler = (_, info) => {
        console.log("Evento recibido: update-available", info);
        callback(info);
      };
      ipcRenderer.on('update-available', handler);
      return () => ipcRenderer.removeListener('update-available', handler);
    }
    return () => {};
  },
  
  // No hay actualizaciones
  onUpdateNotAvailable: (callback) => {
    if (isElectron()) {
      console.log("Registrando evento: update-not-available");
      const handler = () => {
        console.log("Evento recibido: update-not-available");
        callback();
      };
      ipcRenderer.on('update-not-available', handler);
      return () => ipcRenderer.removeListener('update-not-available', handler);
    }
    return () => {};
  },
  
  // Progreso de descarga
  onUpdateProgress: (callback) => {
    if (isElectron()) {
      console.log("Registrando evento: update-progress");
      const handler = (_, progressObj) => {
        console.log("Evento recibido: update-progress", progressObj);
        callback(progressObj);
      };
      ipcRenderer.on('update-progress', handler);
      return () => ipcRenderer.removeListener('update-progress', handler);
    }
    return () => {};
  },
  
  // Actualización descargada
  onUpdateDownloaded: (callback) => {
    if (isElectron()) {
      console.log("Registrando evento: update-downloaded");
      const handler = (_, info) => {
        console.log("Evento recibido: update-downloaded", info);
        callback(info);
      };
      ipcRenderer.on('update-downloaded', handler);
      return () => ipcRenderer.removeListener('update-downloaded', handler);
    }
    return () => {};
  },
  
  // Error de actualización
  onUpdateError: (callback) => {
    if (isElectron()) {
      console.log("Registrando evento: update-error");
      const handler = (_, error) => {
        console.log("Evento recibido: update-error", error);
        callback(error);
      };
      ipcRenderer.on('update-error', handler);
      return () => ipcRenderer.removeListener('update-error', handler);
    }
    return () => {};
  },
  
  // Evento adicional para info de actualización
  onUpdaterInfo: (callback) => {
    if (isElectron()) {
      console.log("Registrando evento: updater-info");
      const handler = (_, info) => {
        console.log("Evento recibido: updater-info", info);
        // ¡IMPORTANTE! Si la versión es 0.0.0, reemplazarla con una versión real
        if (!info.currentVersion || info.currentVersion === '0.0.0') {
          info.currentVersion = getAppVersion();
          console.log("Corregida versión en evento a:", info.currentVersion);
        }
        callback(info);
      };
      ipcRenderer.on('updater-info', handler);
      return () => ipcRenderer.removeListener('updater-info', handler);
    }
    return () => {};
  }
});