
import React, { useEffect, useContext, useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Register from './components/Register';
import Login from './components/Login';
import ChatRoom from './components/ChatRoom';
import Home from './pages/Home';
import Chats from "./pages/Chats";
import PrivateChat from "./pages/PrivateChat";
import EditProfile from "./pages/EditProfile";
import NotificationListener from './components/NotificationListener';
import { ToastProvider } from "./context/ToastContext";
import GroupChatPage from "./pages/groupchatpage";
import GroupNotificationListener from "./components/GroupNotificationListener";
import FriendRequestListener from './components/FriendRequestListener';
import { AuthContext } from "./context/AuthContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase/config";
import AlertNotifications from './components/AlertNotifications';
import NotificationService from "./utils/NotificationService";
import { toast } from "react-toastify";
import NotificationNavigator from "./components/NotificationNavigator";
import CheckUpdates from './components/CheckUpdates';
// Verificar si estamos en Electron
const isElectron = window && window.electronAPI;

// Desactivar logs en producción
const isProduction = process.env.NODE_ENV === 'production';
const logger = {
  log: (...args) => {
    if (!isProduction) console.log(...args);
  },
  error: (...args) => console.error(...args) // Mantener errores incluso en producción
};

// Función global para actualizar el estado online (fuera del componente)
const updateOnlineStatus = async (userId, username, status) => {
  if (!userId || !username) return;

  // Log solo en desarrollo
  logger.log(`[GLOBAL] Actualizando estado a: ${status ? 'online' : 'offline'} para ${username}`);

  // Notificar a Electron el cambio de estado (si estamos en Electron)
  if (isElectron) {
    window.electronAPI.setOnlineStatus(status);
  }

  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      online: status,
      lastSeen: new Date() // Usar una fecha directa para mayor consistencia
    });
  } catch (error) {
    logger.error("[GLOBAL] Error updating online status:", error);
  }
};

// Función para enviar notificaciones que funciona en Web y Electron
const sendNotification = (title, options = {}) => {
  if (isElectron) {
    // Usar notificaciones nativas de Electron
    window.electronAPI.sendNotification(title, options.body || '');
    return true;
  } else {
    // Continuar con el método normal de NotificationService
    return NotificationService.showNotification(title, options);
  }
};

// Componente responsable únicamente del seguimiento de estado online
function OnlineStatusTracker() {
  const { user, userData } = useContext(AuthContext);
  const location = useLocation();

  useEffect(() => {
    if (!user) return;

    const userId = user.uid;
    const username = userData?.username || user.email?.split('@')[0];
    
    // Siempre establecer como online al montar (si la página está visible)
    if (document.visibilityState === 'visible') {
      updateOnlineStatus(userId, username, true);
    }

    // Verificar localStorage (para limpiar estado anterior si el navegador se cerró)
    try {
      const closingData = localStorage.getItem('user_closing');
      if (closingData) {
        const { userId: prevUserId } = JSON.parse(closingData);
        if (prevUserId === userId) {
          updateOnlineStatus(userId, username, true); // Actualizar a online si se encuentra indicador
        }
        localStorage.removeItem('user_closing');
      }
    } catch (e) {
      logger.error("[OnlineTracker] Error checking localStorage:", e);
    }
    
    // Actualización regular del estado online para evitar que caduque
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateOnlineStatus(userId, username, true);
      }
    }, 20000); // Cada 20 segundos
    
    // Manejar cambios de visibilidad de la página
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      updateOnlineStatus(userId, username, isVisible);
    };
    
    // Manejar estado online/offline del navegador
    const handleOnline = () => {
      if (document.visibilityState === 'visible') {
        updateOnlineStatus(userId, username, true);
        
        // Mostrar notificación de reconexión en Electron
        if (isElectron) {
          window.electronAPI.sendNotification(
            'Conexión restablecida', 
            'Te has vuelto a conectar a Internet'
          );
        }
      }
    };
    
    const handleOffline = () => {
      updateOnlineStatus(userId, username, false);
    };
    
    // Manejar cierre de ventana/pestaña
    const handleBeforeUnload = () => {
      // Usar localStorage como método principal (más confiable)
      try {
        localStorage.setItem('user_closing', JSON.stringify({
          userId,
          username,
          timestamp: new Date().getTime()
        }));
      } catch (e) {
        logger.error("[OnlineTracker] Error setting localStorage:", e);
      }
      
      // Intentar usar sendBeacon como respaldo
      if (navigator.sendBeacon) {
        const data = new Blob([JSON.stringify({ 
          userId, 
          username, 
          status: false 
        })], { type: 'application/json' });
        navigator.sendBeacon('/api/update-offline', data);
      }
    };
    
    // Registrar todos los event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    
    // Cleanup function
    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [user, userData]); // No incluir location.pathname para evitar re-ejecutar en cambios de ruta

  // No necesitamos logs para cada cambio de ruta
  return null; // Este componente no renderiza nada
}

// Componente para manejar características específicas de Electron
function ElectronFeatures() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    if (!isElectron) return;

    // Mostrar información de la aplicación en desarrollo
    if (window.electronAPI.isDev) {
      logger.log('Información de la aplicación Electron:', window.electronAPI.getAppInfo());
    }
//toast.success
    // Configurar evento para manejar clics en notificaciones
    window.electronAPI.onNotificationClick((_, payload) => {
      // Aquí puedes manejar lo que ocurre cuando se hace clic en una notificación
      logger.log('Notificación clickeada:', payload);
      // Por ejemplo, navegar a una ruta específica si es relevante
    });

    // Mensaje de bienvenida de Electron
    setTimeout(() => {
      if (!localStorage.getItem('electron_welcome_shown')) {
        window.electronAPI.sendNotification(
          'Dogito Chat para escritorio',
          'La aplicación ahora se está ejecutando como app nativa. Permanecerá en la bandeja del sistema al cerrarla.'
        );
        localStorage.setItem('electron_welcome_shown', 'true');
      }
    }, 3000);

    // Manejar eventos de actualización
    window.electronAPI.updates.onUpdateAvailable((_, info) => {
      setUpdateAvailable(true);
      setUpdateInfo(info);
      toast.info(`Nueva versión ${info.version} disponible. Se descargará automáticamente.`, {
        autoClose: 5000
      });
    });
//ElectronFeatures
    window.electronAPI.updates.onUpdateDownloaded((_, info) => {
      setUpdateDownloaded(true);
      setUpdateInfo(info);
      toast.success(
        <div className="fixed bottom-4 right-4 z-50 bg-indigo-700 text-white p-4 rounded-lg shadow-lg max-w-sm">
        {updateDownloaded ? (
          <>
            <h3 className="font-bold">¡Actualización lista!</h3>
            <p className="mb-3">La versión {updateInfo?.version} está lista para instalar.</p>
            <button 
              onClick={() => window.electronAPI.updates.installUpdate()}
              className="px-4 py-2 bg-white text-indigo-700 rounded hover:bg-gray-100"
            >
              Instalar y reiniciar
            </button>
          </>
        ) : (
          <>
            <h3 className="font-bold">Nueva versión disponible</h3>
            <p>La versión {updateInfo?.version} se está descargando...</p>
          </>
        )}
      </div>,
        {
          autoClose: false,
          closeOnClick: false
        }
      );
    });

    window.electronAPI.updates.onUpdateError((_, error) => {
      logger.error('Error de actualización:', error);
      toast.error('Error al buscar actualizaciones.', {
        autoClose: 3000
      });
    });

  }, []);

  // Si hay alguna actualización disponible o descargada, renderizar un banner
  if (updateAvailable || updateDownloaded) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-indigo-700 text-white p-4 rounded-lg shadow-lg max-w-sm">
        {updateDownloaded ? (
          <>
            <h3 className="font-bold">¡Actualización lista!</h3>
            <p className="mb-3">La versión {updateInfo?.version} está lista para instalar.</p>
            <button 
              onClick={() => window.electronAPI.updates.installUpdate()}
              className="px-4 py-2 bg-white text-indigo-700 rounded hover:bg-gray-100"
            >
              Instalar y reiniciar
            </button>
          </>
        ) : (
          <>
            <h3 className="font-bold">Nueva versión disponible</h3>
            <p>La versión {updateInfo?.version} se está descargando...</p>
          </>
        )}
      </div>
    );
  }

  return null;
}

export default function App() {
  // Inicializar el sistema de notificaciones y registrar el Service Worker
  useEffect(() => {
    const initNotifications = async () => {
      // En Electron usamos notificaciones nativas, así que no necesitamos inicializar 
      // el sistema de notificaciones web si estamos en Electron
      if (!isElectron && NotificationService.isSupported()) {
        // Registrar el Service Worker independientemente del permiso de notificaciones
        try {
          // Registrar el Service Worker lo antes posible
          if ('serviceWorker' in navigator) {
            try {
              const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
              });
              logger.log('Service Worker registrado con éxito:', registration);
            } catch (error) {
              logger.error('Error al registrar el Service Worker:', error);
            }
          }
        } catch (error) {
          logger.error('Error al verificar el Service Worker:', error);
        }
        
        // Verificar si ya hemos guardado la preferencia
        const notifKey = "notificacionesAceptadas";
        
        if (localStorage.getItem(notifKey) === 'true') {
          // El usuario ya aceptó las notificaciones, inicializar el sistema
          try {
            await NotificationService.initialize();
            
            // Si estamos en producción (no en localhost) y no se ha mostrado mensaje de bienvenida
            if (!window.location.hostname.includes('localhost') && 
                !window.location.hostname.includes('127.0.0.1') &&
                !localStorage.getItem('welcome_notification_shown')) {
              // Esperar un poco antes de mostrar la notificación
              setTimeout(() => {
                // Intentar usar el Service Worker para mostrar la notificación
                if (navigator.serviceWorker.controller) {
                  navigator.serviceWorker.controller.postMessage({
                    type: 'SEND_NOTIFICATION',
                    payload: {
                      title: '¡Notificaciones activas!',
                      body: 'Ahora recibirás notificaciones incluso cuando esta aplicación esté cerrada.',
                      requireInteraction: false
                    }
                  });
                } else {
                  // Fallback al método normal
                  NotificationService.showNotification(
                    '¡Notificaciones activas!',
                    {
                      body: 'Ahora recibirás notificaciones incluso cuando esta aplicación esté cerrada.',
                      requireInteraction: false
                    }
                  );
                }
                localStorage.setItem('welcome_notification_shown', 'true');
              }, 5000);
            }
          } catch (error) {
            logger.error('Error al inicializar el sistema de notificaciones:', error);
          }
        }
      }
    };

    initNotifications();
  }, []);

  // Sobreescribir el método de notificación en NotificationService
  useEffect(() => {
    if (isElectron) {
      // Reemplazar el método showNotification para usar notificaciones de Electron
      const originalShowNotification = NotificationService.showNotification;
      NotificationService.showNotification = (title, options) => {
        return sendNotification(title, options);
      };

      return () => {
        // Restaurar el método original cuando el componente se desmonte
        NotificationService.showNotification = originalShowNotification;
      };
    }
  }, []);

  // Mostrar versión de la aplicación en Electron
  useEffect(() => {
    if (isElectron) {
      const appInfo = window.electronAPI.getAppInfo();
      logger.log(`Dogito Chat versión ${appInfo.appVersion}`);
      window.electronAPI.onManualCheckForUpdates(() => {
        toast.info("Buscando actualizaciones...", {
          autoClose: 3000
        });
      });
      
    }
  }, []);

  return (
    <Router>
      <ToastProvider>
        <div>
          <Navbar />
          
          {/* Componente de alerta para notificaciones */}
          <AlertNotifications />
          
          {/* Sistema de seguimiento de estado online global */}
          <OnlineStatusTracker />
          
          {/* Características específicas de Electron */}
          {isElectron && <ElectronFeatures />}
          {isElectron && <NotificationNavigator />}
          <NotificationListener />
          <GroupNotificationListener />
          <FriendRequestListener />
          <CheckUpdates />
           
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/chat" element={<Chats />} />
            <Route path="/chat/:username" element={<PrivateChat />} />
            <Route path="/editprofile" element={<EditProfile />} />
            <Route path="/chat/group/:groupId" element={<GroupChatPage />} />
          </Routes>
          
        </div>
      </ToastProvider>
    </Router>
  );
}