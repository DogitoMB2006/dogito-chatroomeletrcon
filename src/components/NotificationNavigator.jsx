import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Verificar si estamos en Electron
const isElectron = window && window.electronAPI;

// Componente para manejar la navegación desde notificaciones en Electron
export default function NotificationNavigator() {
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isElectron) return;
    
    // Configurar evento de notificación para navegar cuando se hace clic
    window.electronAPI.onNotificationClick((_, payload) => {
      if (payload && payload.route) {
        navigate(payload.route);
      }
    });
    
    // Escuchar evento personalizado de navegación desde preload.cjs
    const handleElectronNavigate = (event) => {
      if (event.detail && event.detail.route) {
        navigate(event.detail.route);
      }
    };
    
    document.addEventListener('electron-navigate', handleElectronNavigate);
    
    return () => {
      document.removeEventListener('electron-navigate', handleElectronNavigate);
    };
  }, [navigate]);
  
  // Este componente no renderiza nada visualmente
  return null;
}