// Archivo: sw-register.js
// Este script maneja el registro del Service Worker de manera compatible con Electron

// Función para detectar si estamos en un entorno Electron
function isElectron() {
  // Renderer process
  if (typeof window !== 'undefined' && typeof window.process === 'object' && window.process.type === 'renderer') {
    return true;
  }
  
  // Main process
  if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
    return true;
  }
  
  // Detect the user agent when the `nodeIntegration` option is set to true
  if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
    return true;
  }

  // Comprobación adicional para Electron con contextIsolation
  if (typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined') {
    return true;
  }
  
  return false;
}

// Solo registrar el Service Worker si:
// 1. El navegador lo soporta
// 2. NO estamos en Electron
if ('serviceWorker' in navigator && !isElectron()) {
  window.addEventListener('load', () => {
    // Registrar el Service Worker solo en producción
    if (window.location.protocol === 'https:' || window.location.hostname === 'localhost') {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registrado con éxito:', registration);
        })
        .catch(error => {
          console.error('Error al registrar el Service Worker:', error);
        });
    } else {
      console.log('Service Worker no registrado: protocolo no seguro');
    }
  });
} else {
  console.log('Service Worker no disponible o entorno Electron detectado');
}