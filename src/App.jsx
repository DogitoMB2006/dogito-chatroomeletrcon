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

// Verificar si estamos en Electron de manera más robusta
const isElectron = () => {
  return window && 
         ((window.process && window.process.type === 'renderer') || 
          (typeof window.electronAPI !== 'undefined'));
};

// Variable global para acceso rápido
const inElectron = isElectron();

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
  if (inElectron && window.electronAPI && window.electronAPI.setOnlineStatus) {
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
  if (inElectron && window.electronAPI && window.electronAPI.notifications) {
    // Usar notificaciones nativas de Electron
    window.electronAPI.notifications.send(title, options.body || '');
    return Promise.resolve(true);
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
        if (inElectron && window.electronAPI && window.electronAPI.notifications) {
          window.electronAPI.notifications.send(
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
    if (!inElectron || !window.electronAPI) return;

    // Mostrar información de la aplicación en desarrollo
    if (window.electronAPI.isDev) {
      logger.log('Información de la aplicación Electron:', window.electronAPI.getAppInfo && window.electronAPI.getAppInfo());
    }

    // Configurar evento para manejar clics en notificaciones
    if (window.electronAPI.notifications && window.electronAPI.notifications.onClicked) {
      const unsubscribe = window.electronAPI.notifications.onClicked(() => {
        // Aquí puedes manejar lo que ocurre cuando se hace clic en una notificación
        logger.log('Notificación clickeada');
        // Por ejemplo, navegar a una ruta específica si es relevante
      });
      
      // Retornar función para desuscribirse cuando el componente se desmonte
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }

    // Mensaje de bienvenida de Electron
    setTimeout(() => {
      if (!localStorage.getItem('electron_welcome_shown') && window.electronAPI.notifications) {
        window.electronAPI.notifications.send(
          'Dogito Chat para escritorio',
          'La aplicación ahora se está ejecutando como app nativa. Permanecerá en la bandeja del sistema al cerrarla.'
        );
        localStorage.setItem('electron_welcome_shown', 'true');
      }
    }, 3000);

    // Manejar eventos de actualización (solo si están disponibles)
    if (window.electronAPI.updates) {
      // Actualización disponible
      if (window.electronAPI.updates.onUpdateAvailable) {
        const unsubscribeAvailable = window.electronAPI.updates.onUpdateAvailable((info) => {
          setUpdateAvailable(true);
          setUpdateInfo(info);
          toast.info(`Nueva versión ${info.version} disponible. Se descargará automáticamente.`, {
            autoClose: 5000
          });
        });
        
        // Actualización descargada
        const unsubscribeDownloaded = window.electronAPI.updates.onUpdateDownloaded((info) => {
          setUpdateDownloaded(true);
          setUpdateInfo(info);
          toast.success(
            <div>
              <h3 className="font-bold">¡Actualización lista!</h3>
              <p className="mb-2">La versión {info?.version} está lista para instalar.</p>
              <button 
                onClick={() => window.electronAPI.updates.installUpdate && window.electronAPI.updates.installUpdate()}
                className="px-3 py-1 bg-white text-indigo-700 rounded hover:bg-gray-100 text-sm"
              >
                Instalar y reiniciar
              </button>
            </div>,
            {
              autoClose: false,
              closeOnClick: false
            }
          );
        });
        
        // Error de actualización
        const unsubscribeError = window.electronAPI.updates.onUpdateError((error) => {
          logger.error('Error de actualización:', error);
          toast.error('Error al buscar actualizaciones.', {
            autoClose: 3000
          });
        });
        
        // Limpieza al desmontar
        return () => {
          if (typeof unsubscribeAvailable === 'function') unsubscribeAvailable();
          if (typeof unsubscribeDownloaded === 'function') unsubscribeDownloaded();
          if (typeof unsubscribeError === 'function') unsubscribeError();
        };
      }
    }
  }, []);

  // Si hay alguna actualización disponible o descargada, renderizar un banner
  if ((updateAvailable || updateDownloaded) && updateInfo) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-indigo-700 text-white p-4 rounded-lg shadow-lg max-w-sm">
        {updateDownloaded ? (
          <>
            <h3 className="font-bold">¡Actualización lista!</h3>
            <p className="mb-3">La versión {updateInfo?.version} está lista para instalar.</p>
            <button 
              onClick={() => window.electronAPI.updates && window.electronAPI.updates.installUpdate && window.electronAPI.updates.installUpdate()}
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

// Componente para solucionar problema de inputs no clickeables
function InputFocusFixer() {
  useEffect(() => {
    // Esta función soluciona el problema de inputs que no responden al primer clic
    const fixInputFocus = () => {
      // En Electron, a veces hay un problema con los event listeners de los inputs
      if (inElectron) {
        logger.log("🔧 Aplicando solución para mejorar la respuesta de los inputs");
        
        // Forzar un redibujado del DOM puede ayudar a solucionar problemas de eventos
        const forceReflow = () => {
          document.body.getBoundingClientRect();
        };
        
        // Primera ejecución inmediata
        forceReflow();
        
        // Segunda ejecución después de que todo esté cargado
        setTimeout(forceReflow, 100);
        
        // Forzar el foco en el primer input visible (opcional)
        setTimeout(() => {
          const firstInput = document.querySelector('input:not([type="hidden"])');
          if (firstInput) {
            firstInput.blur();  // Primero quitar el foco
            firstInput.focus(); // Luego volver a aplicarlo
            firstInput.blur();  // Y finalmente quitarlo para no interferir con la UX
          }
        }, 200);
        
        // Solucionar problema específico de Electron con los eventos de mouse
        const fixElectronInputs = () => {
          const inputs = document.querySelectorAll('input, textarea');
          inputs.forEach(input => {
            // Asegurarse de que los eventos de mouse estén correctamente registrados
            const clone = input.cloneNode(true);
            input.parentNode.replaceChild(clone, input);
            
            // Preservar los manejadores de eventos React
            if (input._valueTracker) {
              clone._valueTracker = input._valueTracker;
            }
          });
        };
        
        // Aplicar solución para inputs en Electron después de un corto retraso
        setTimeout(fixElectronInputs, 300);
      }
    };
    
    // Ejecutar al montar
    fixInputFocus();
    
    // Ejecutar también cuando cambie la ruta
    window.addEventListener('hashchange', fixInputFocus);
    
    return () => {
      window.removeEventListener('hashchange', fixInputFocus);
    };
  }, []);
  
  return null;
}

export default function App() {
  // Inicializar el sistema de notificaciones y registrar el Service Worker
  useEffect(() => {
    const initNotifications = async () => {
      // En Electron usamos notificaciones nativas, así que no necesitamos inicializar 
      // el sistema de notificaciones web si estamos en Electron
      if (!inElectron && NotificationService.isSupported()) {
        // Verificar si estamos en Electron para no intentar registrar el Service Worker
        if (!inElectron && 'serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
              scope: '/'
            });
            logger.log('Service Worker registrado con éxito:', registration);
          } catch (error) {
            logger.error('Error al registrar el Service Worker:', error);
          }
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
                if (navigator.serviceWorker && navigator.serviceWorker.controller) {
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
    if (inElectron) {
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
    if (inElectron && window.electronAPI) {
      // Verificar si la función getAppInfo existe
      if (window.electronAPI.getAppInfo) {
        const appInfo = window.electronAPI.getAppInfo();
        logger.log(`Dogito Chat versión ${appInfo.appVersion}`);
      }
      
      // Verificar si onManualCheckForUpdates existe
      if (window.electronAPI.onManualCheckForUpdates) {
        window.electronAPI.onManualCheckForUpdates(() => {
          toast.info("Buscando actualizaciones...", {
            autoClose: 3000
          });
        });
      }
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
          {inElectron && <ElectronFeatures />}
          {inElectron && window.electronAPI && <NotificationNavigator />}
          
          {/* Nuevo componente para solucionar problemas de inputs */}
          <InputFocusFixer />
          
          <NotificationListener />
          <GroupNotificationListener />
          <FriendRequestListener />
          {inElectron && window.electronAPI && window.electronAPI.updates && <CheckUpdates />}
           
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