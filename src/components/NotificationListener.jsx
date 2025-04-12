import { useContext, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  limit
} from "firebase/firestore";
import { AuthContext } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import NotificationService from "../utils/NotificationService";

// Verificar si estamos en Electron
const isElectron = window && window.electronAPI;

export default function NotificationListener() {
  const { userData } = useContext(AuthContext);
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Referencia para la limpieza de event listeners
  const notificationClickUnsubRef = useRef(null);

  // Configurar un solo listener para eventos de clic en notificaciones
  useEffect(() => {
    if (isElectron) {
      const unsubNotifClick = window.electronAPI.onNotificationClick(() => {
        console.log("Notificación de mensaje privado clickeada");
        // La navegación específica se manejará en cada notificación individual
      });
      
      notificationClickUnsubRef.current = unsubNotifClick;
      
      return () => {
        if (unsubNotifClick) unsubNotifClick();
      };
    }
  }, []);

  useEffect(() => {
    if (!userData) return;

    const notifKey = "private_last_notif";
    const lastSeen = JSON.parse(localStorage.getItem(notifKey) || "{}");
    
    const unsubMessageListeners = new Map();
    
    // Obtenemos la lista de amigos para monitorear los mensajes de ellos
    const friendsList = userData.friends || [];
    
    // Si no hay amigos, no hay nada que monitorear
    if (friendsList.length === 0) return;
    
    // Para cada amigo, creamos un listener que monitorea los mensajes nuevos
    friendsList.forEach(friend => {
      const messagesRef = collection(db, "messages");
      const msgQuery = query(
        messagesRef,
        where("from", "==", friend),
        where("to", "==", userData.username),
        where("read", "==", false),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      
      const unsub = onSnapshot(msgQuery, async (msgSnap) => {
        // Si no hay mensajes no leídos, no hacemos nada
        if (msgSnap.empty) return;
        
        const last = msgSnap.docs[0];
        const data = last.data();
        const msgId = last.id;
        
        // Si ya vimos este mensaje, no hacemos nada
        const lastNotif = lastSeen[friend];
        if (lastNotif && lastNotif === msgId) return;
        
        // Guardamos este mensaje como el último visto
        lastSeen[friend] = msgId;
        localStorage.setItem(notifKey, JSON.stringify(lastSeen));
        
        // Verificar si ya estamos en el chat de este amigo
        const isPageVisible = document.visibilityState === 'visible';
        const currentPath = location.pathname;
        const friendPath = `/chat/${friend}`;
        
        // Si estamos en el chat con este amigo y la página está visible, no mostrar notificación
        if (currentPath === friendPath && isPageVisible) return;
        
        // Obtener información del remitente para mostrar su foto
        const senderInfo = await getSenderInfo(friend);
        
        // Mostrar toast dentro de la app siempre
        showToast({
          username: friend,
          text: data.text || (data.image ? "📷 Imagen" : ""),
          photoURL: senderInfo?.photoURL || null,
          type: "private",
          from: friend
        });
        
        // Si el usuario ha habilitado notificaciones y la página no está enfocada o no estamos en el chat del amigo
        if (!isPageVisible || currentPath !== friendPath) {
          const messageText = data.text || (data.image ? "📷 Imagen" : "");
          const notificationTitle = `Mensaje de ${friend}`;
          
          try {
            // Si estamos en Electron, usar notificaciones nativas
            if (isElectron) {
              console.log(`Enviando notificación de mensaje privado: ${notificationTitle} - ${messageText}`);
              
              // Usar el método para enviar notificaciones
              window.electronAPI.sendNotification(notificationTitle, messageText);
              
              // Configurar navegación para esta notificación específica 
              const finalFriendPath = friendPath; // Capturar en closure
              
              // Registramos un nuevo handler específico para esta notificación
              window.electronAPI.onNotificationClick(() => {
                console.log(`Navegando a chat privado: ${finalFriendPath}`);
                navigate(finalFriendPath);
              });
            }
            // Si no estamos en Electron, usar el sistema de notificaciones del navegador
            else if (NotificationService.isEnabled()) {
              const notificationOptions = {
                body: messageText,
                icon: senderInfo?.photoURL || '/default-avatar.png',
                data: {
                  url: friendPath,
                  messageId: msgId
                },
                requireInteraction: false
              };
              
              // Usar Service Worker si está disponible
              if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                console.log('Enviando notificación privada a través del Service Worker');
                navigator.serviceWorker.controller.postMessage({
                  type: 'SEND_NOTIFICATION',
                  payload: {
                    title: notificationTitle,
                    ...notificationOptions
                  }
                });
              } else {
                // Fallback a la API de notificaciones directamente
                console.log('Service Worker no disponible, usando notificación directa');
                new Notification(notificationTitle, {
                  body: messageText,
                  icon: senderInfo?.photoURL || '/default-avatar.png'
                });
              }
            }
          } catch (error) {
            console.error("Error al mostrar notificación de mensaje privado:", error);
          }
        }
      });
      
      unsubMessageListeners.set(friend, unsub);
    });
    
    // Función auxiliar para obtener información del remitente
    async function getSenderInfo(username) {
      try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          return snapshot.docs[0].data();
        }
        return null;
      } catch (error) {
        console.error("Error al obtener información del remitente:", error);
        return null;
      }
    }

    return () => {
      // Limpiar todos los listeners de mensajes
      unsubMessageListeners.forEach(unsub => unsub());
      
      // Limpiar el listener de notificaciones de Electron
      if (notificationClickUnsubRef.current) {
        notificationClickUnsubRef.current();
        notificationClickUnsubRef.current = null;
      }
    };
  }, [userData, showToast, location.pathname, navigate]);

  return null;
}