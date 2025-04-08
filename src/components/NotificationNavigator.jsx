import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Verificar si estamos en Electron
const isElectron = window && window.electronAPI;

// Componente para manejar la navegación desde notificaciones en Electron
export default function NotificationNavigator() {
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isElectron) return;
    
    console.log("NotificationNavigator: Configurando manejador de clics en notificaciones");
    
    // Configurar evento de notificación para navegar cuando se hace clic
    const onNotificationClickHandler = (event, payload) => {
      console.log("NotificationNavigator: Notificación clickeada con payload:", payload);
      
      // Verificar que tengamos un payload y una ruta
      if (payload && payload.route) {
        console.log(`NotificationNavigator: Navegando a ruta: ${payload.route}`);
        navigate(payload.route);
      } else {
        console.warn("NotificationNavigator: No hay ruta especificada en el payload de la notificación");
      }
    };
    
    // Registrar el manejador con el API de Electron
    let unsubscribeNotificationClick = null;
    if (window.electronAPI.onNotificationClick) {
      unsubscribeNotificationClick = window.electronAPI.onNotificationClick(onNotificationClickHandler);
      console.log("NotificationNavigator: Manejador de clics en notificaciones registrado");
    }
    
    // Escuchar evento personalizado de navegación desde preload.cjs
    const handleElectronNavigate = (event) => {
      console.log("NotificationNavigator: Evento electron-navigate recibido", event.detail);
      
      if (event.detail && event.detail.route) {
        console.log(`NotificationNavigator: Navegando a ruta desde evento: ${event.detail.route}`);
        navigate(event.detail.route);
      }
    };
    
    document.addEventListener('electron-navigate', handleElectronNavigate);
    console.log("NotificationNavigator: Evento electron-navigate registrado");
    
    // Función de limpieza
    return () => {
      console.log("NotificationNavigator: Limpiando manejadores de eventos");
      document.removeEventListener('electron-navigate', handleElectronNavigate);
      
      if (typeof unsubscribeNotificationClick === 'function') {
        unsubscribeNotificationClick();
        console.log("NotificationNavigator: Manejador de clics en notificaciones eliminado");
      }
    };
  }, [navigate]);
  
  // Este componente no renderiza nada visualmente
  return null;
}