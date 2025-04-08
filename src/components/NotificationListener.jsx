import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  limitToLast
} from "firebase/firestore";
import { AuthContext } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import NotificationService from "../utils/NotificationService";

// Verificar si estamos en Electron
const isElectron = window && window.electronAPI;

export default function NotificationListener() {
  const { userData } = useContext(AuthContext);
  const { showToast } = useToast();
  const lastTimestampRef = useRef(Date.now()); 
  const location = useLocation();
  const navigate = useNavigate();
  const [processedMsgIds] = useState(new Set()); 
  const pendingNavigationRef = useRef(null);
  
  // Referencia para la limpieza de event listeners
  const notificationClickUnsubRef = useRef(null);

  // Configurar un manejador global para las notificaciones en Electron
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    
    console.log("Configurando manejador global de clics en notificaciones para mensajes privados");
    
    // Registrar el listener para clicks en notificaciones
    const unsubNotifClick = window.electronAPI.onNotificationClick(() => {
      console.log("Notificación de mensaje privado clickeada");
      
      if (pendingNavigationRef.current) {
        console.log(`Navegando a: ${pendingNavigationRef.current}`);
        navigate(pendingNavigationRef.current);
        pendingNavigationRef.current = null;
      } else {
        console.log("No hay ruta de navegación pendiente");
      }
    });
    
    // Guardar la función de limpieza
    notificationClickUnsubRef.current = unsubNotifClick;
    
    // Limpiar al desmontar
    return () => {
      if (unsubNotifClick) {
        console.log("Limpiando manejador de clics en notificaciones");
        unsubNotifClick();
        notificationClickUnsubRef.current = null;
      }
    };
  }, [navigate]);

  useEffect(() => {
    if (!userData) return;

    const q = query(
      collection(db, "messages"),
      where("to", "==", userData.username),
      where("read", "==", false),
      orderBy("timestamp", "desc"),
      limitToLast(10) 
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const latest = snapshot.docChanges().filter(change => change.type === "added");

      for (const change of latest) {
        const msgId = change.doc.id;
        const msg = change.doc.data();

        if (processedMsgIds.has(msgId)) continue;
        processedMsgIds.add(msgId);

        if (
          !msg.timestamp ||
          msg.timestamp.toMillis() < lastTimestampRef.current
        ) continue;

        // Verificar si la página está activa o no
        const isPageVisible = document.visibilityState === 'visible';
        const currentPath = location.pathname;
        const senderPath = `/chat/${msg.from}`;
        
        // Si estamos en la página del chat con este usuario y la página está visible, no mostrar notificación
        if (currentPath === senderPath && isPageVisible) continue;

        // Obtener información del remitente
        const q = query(
          collection(db, "users"),
          where("username", "==", msg.from)
        );
        const snap = await getDocs(q);
        const sender = !snap.empty ? snap.docs[0].data() : null;

        // Mostrar toast dentro de la app siempre
        showToast({
          username: msg.from,
          text: msg.text || (msg.image ? "📷 Imagen" : ""),
          photoURL: sender?.photoURL,
          type: "private", 
          from: msg.from, 
        });

        // Preparar datos para la notificación
        const messageText = msg.text || (msg.image ? "📷 Imagen" : "");
        const notificationTitle = `Mensaje de ${msg.from}`;
        
        // Si el usuario ha habilitado notificaciones y la página no está enfocada o estamos en otra sección
        try {
          if ((!isPageVisible || currentPath !== senderPath)) {
            // Si estamos en Electron, usar notificaciones nativas
            if (isElectron && window.electronAPI) {
              console.log(`Enviando notificación Electron: ${notificationTitle} - ${messageText}`);
              
              // IMPORTANTE: Guardar la ruta de navegación para usarla cuando se haga clic en la notificación
              pendingNavigationRef.current = senderPath;
              
              // Usar la función correcta del API expuesto en preload.cjs
              window.electronAPI.sendNotification(notificationTitle, messageText);
              
              // Ya no registramos un nuevo manejador para cada notificación
              // El manejador global configurado anteriormente se encargará de la navegación
            }
            // Si no estamos en Electron, usar el sistema de notificaciones del navegador
            else if (Notification.permission === 'granted' && 
                localStorage.getItem('notificationsEnabled') === 'true') {
              
              console.log('Enviando notificación de nuevo mensaje:', notificationTitle);
              
              const notificationOptions = {
                body: messageText,
                icon: sender?.photoURL || '/default-avatar.png',
                data: {
                  url: `/chat/${msg.from}`,
                  messageId: msgId
                },
                requireInteraction: false
              };
              
              // Intentar mostrar notificación a través del Service Worker primero
              if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                  type: 'SEND_NOTIFICATION',
                  payload: {
                    title: notificationTitle,
                    ...notificationOptions
                  }
                });
              } else {
                // Fallback al método del servicio
                await NotificationService.showNotification(
                  notificationTitle,
                  notificationOptions
                );
              }
            }
          }
        } catch (error) {
          console.error("Error al mostrar notificación:", error);
        }
      }
    });

    return () => {
      // Limpiar el listener de Firestore
      unsub();
    };
  }, [userData, location.pathname, processedMsgIds, navigate, showToast]); 

  return null;
}