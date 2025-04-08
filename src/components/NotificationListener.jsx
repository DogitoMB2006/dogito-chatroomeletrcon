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
  
  const notificationClickUnsubRef = useRef(null);

  useEffect(() => {
    if (isElectron) {
      const unsubNotifClick = window.electronAPI.onNotificationClick(() => {
        console.log("Notificación de mensaje privado clickeada");
      });
      
      notificationClickUnsubRef.current = unsubNotifClick;
      
      return () => {
        if (unsubNotifClick) unsubNotifClick();
      };
    }
  }, []);

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
            if (isElectron) {
              console.log(`Enviando notificación de mensaje privado: ${notificationTitle} - ${messageText}`);
              
              // IMPORTANTE: Usar exactamente el mismo enfoque que en GroupNotificationListener
              window.electronAPI.sendNotification(notificationTitle, messageText);
              
              // Configurar navegación para esta notificación específica 
              const finalSenderPath = senderPath; // Capturar en closure
              
              // Registramos un nuevo handler específico para esta notificación
              window.electronAPI.onNotificationClick(() => {
                console.log(`Navegando a chat privado: ${finalSenderPath}`);
                navigate(finalSenderPath);
              });
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
      unsub();
      
      if (notificationClickUnsubRef.current) {
        notificationClickUnsubRef.current();
        notificationClickUnsubRef.current = null;
      }
    };
  }, [userData, location.pathname, processedMsgIds, navigate, showToast]); 

  return null;
}