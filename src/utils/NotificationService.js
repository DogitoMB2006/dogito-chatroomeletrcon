const isElectron = window && window.electronAPI;

const NotificationService = {
  isSupported() {
    if (isElectron) return true;
    return 'Notification' in window;
  },
  
  areEnabled() {
    if (isElectron) return true;
    
    if (!this.isSupported()) {
      return false;
    }
    
    const permissionGranted = Notification.permission === 'granted';
    const userPreference = localStorage.getItem('notificationsEnabled') === 'true';
    
    return permissionGranted && userPreference;
  },
  
  isEnabled() {
    return this.areEnabled();
  },
  
  async initialize() {
    if (isElectron) {
      localStorage.setItem('notificationsEnabled', 'true');
      return true;
    }
    
    if (!this.isSupported()) {
      console.warn('Las notificaciones no están soportadas en este navegador');
      return false;
    }
    
    await this.registerServiceWorker();
    
    if (Notification.permission !== 'granted') {
      console.warn('Los permisos de notificación no están concedidos');
      return false;
    }
    
    return true;
  },
  
  async registerServiceWorker() {
    if (isElectron) return null;
    
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker no soportado');
      return null;
    }
    
    try {
      const existingRegistration = await navigator.serviceWorker.getRegistration();
      if (existingRegistration) {
        return existingRegistration;
      }
      
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('Service Worker registrado:', registration);
      
      if (registration.installing) {
        await new Promise(resolve => {
          registration.installing.addEventListener('statechange', e => {
            if (e.target.state === 'activated') {
              resolve();
            }
          });
        });
      }
      
      return registration;
    } catch (error) {
      console.error('Error al registrar Service Worker:', error);
      return null;
    }
  },
  
  async showNotification(title, options = {}) {
    if (isElectron) {
      window.electronAPI.sendNotification(title, options.body || '');
      return true;
    }
    
    if (!this.isEnabled()) {
      console.warn('Las notificaciones no están habilitadas');
      return false;
    }
    
    const swRegistration = await this.registerServiceWorker();
    
    if (!swRegistration) {
      console.error('No se pudo obtener el registro del Service Worker');
      return false;
    }
    
    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SEND_NOTIFICATION',
          payload: {
            title,
            ...options
          }
        });
        
        return true;
      } else {
        await swRegistration.showNotification(title, options);
        return true;
      }
    } catch (error) {
      console.error('Error al enviar notificación:', error);
      
      try {
        new Notification(title, options);
        return true;
      } catch (fallbackError) {
        console.error('Error en fallback de notificación:', fallbackError);
        return false;
      }
    }
  },
  
  isGroupMuted(groupId) {
    try {
      const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
      return mutedGroups.includes(groupId);
    } catch (error) {
      console.error("Error al verificar si el grupo está silenciado:", error);
      return false;
    }
  },
  
  muteGroup(groupId) {
    try {
      const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
      if (!mutedGroups.includes(groupId)) {
        mutedGroups.push(groupId);
        localStorage.setItem('mutedGroups', JSON.stringify(mutedGroups));
      }
      return true;
    } catch (error) {
      console.error("Error al silenciar grupo:", error);
      return false;
    }
  },
  
  unmuteGroup(groupId) {
    try {
      const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
      const index = mutedGroups.indexOf(groupId);
      if (index > -1) {
        mutedGroups.splice(index, 1);
        localStorage.setItem('mutedGroups', JSON.stringify(mutedGroups));
      }
      return true;
    } catch (error) {
      console.error("Error al activar notificaciones de grupo:", error);
      return false;
    }
  },
  
  toggleGroupMute(groupId) {
    if (this.isGroupMuted(groupId)) {
      return this.unmuteGroup(groupId);
    } else {
      return this.muteGroup(groupId);
    }
  }
};

export default NotificationService;

export const areNotificationsEnabled = () => NotificationService.areEnabled();
export const isNotificationsEnabled = () => NotificationService.isEnabled();
export const registerServiceWorker = () => NotificationService.registerServiceWorker();
export const sendNotification = (title, options) => NotificationService.showNotification(title, options);