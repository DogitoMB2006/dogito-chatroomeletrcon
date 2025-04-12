import { useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit, 
  doc, 
  updateDoc, 
  deleteDoc,
  documentId,
  getDoc
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useNavigate } from "react-router-dom";
import AddFriend from "../components/AddFriend";
import FriendRequests from "../components/FriendRequests";
import CreateGroupButton from "../components/CreateGroupButton";
import Staff from "../components/Staff";
import { 
  MdSearch, 
  MdPeopleAlt, 
  MdGroups, 
  MdNotifications,
  MdChat,
  MdMoreVert,
  MdClose,
  MdFilterList,
  MdCheckCircle,
  MdAutorenew,
  MdRefresh,
  MdPersonAdd,
  MdAdd
} from "react-icons/md";
import { listenToUserStatus } from "../utils/onlineStatus";

export default function Chats() {
  const { user, userData } = useContext(AuthContext);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedTab, setSelectedTab] = useState("friends");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastMessages, setLastMessages] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [pendingFriendRequests, setPendingFriendRequests] = useState([]);
  const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortOrder, setSortOrder] = useState("recent"); // "recent", "unread", "alphabetical"
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const navigate = useNavigate();
  const navigationTimeoutRef = useRef(null);
  const clickedItemRef = useRef(null);
  const filterMenuRef = useRef(null);
  
  // Referencia para evitar duplicación en las actualizaciones de contadores
  const processedMessagesRef = useRef(new Set());
  const unreadCountsTimerRef = useRef(null);
  // Referencia para el último userData recibido
  const lastUserDataRef = useRef(null);

  // Cierre del menú de filtros al hacer clic fuera de él
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setShowFilterMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Optimización: Función de navegación mejorada con protección contra doble clic
  const handleNavigation = useCallback((path, id) => {
    // Si ya estamos navegando o hay un timeout activo, ignorar clics adicionales
    if (isNavigating) {
      return;
    }
    
    // Marcar que estamos en proceso de navegación
    setIsNavigating(true);
    
    // Proporcionar feedback visual
    if (clickedItemRef.current) {
      clickedItemRef.current.classList.remove('bg-indigo-700');
    }
    
    // Guardar referencia del elemento en el que se hizo clic
    clickedItemRef.current = document.getElementById(id);
    
    if (clickedItemRef.current) {
      clickedItemRef.current.classList.add('bg-indigo-700');
    }
    
    // Ejecutar la navegación con un pequeño retraso para la transición visual
    clearTimeout(navigationTimeoutRef.current);
    navigationTimeoutRef.current = setTimeout(() => {
      navigate(path);
      // Restablecer el estado después de la navegación
      setIsNavigating(false);
      // Cerrar el menú móvil si está abierto
      setShowMobileMenu(false);
      // Limpiar el estilo después de la navegación
      if (clickedItemRef.current) {
        clickedItemRef.current.classList.remove('bg-indigo-700');
      }
    }, 50);
  }, [navigate, isNavigating]);

  // Limpieza del timeout al desmontar
  useEffect(() => {
    return () => {
      clearTimeout(navigationTimeoutRef.current);
      clearTimeout(unreadCountsTimerRef.current);
    };
  }, []);

  // NUEVA IMPLEMENTACIÓN: Escuchar cambios en tiempo real en el documento del usuario
  useEffect(() => {
    if (!user?.uid) return;
    
    // Listener para cambios en el documento del usuario actual
    const userDocRef = doc(db, "users", user.uid);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        // Verificamos si la lista de amigos ha cambiado
        const currentUserData = docSnapshot.data();
        const previousUserData = lastUserDataRef.current;
        
        // Si la lista de amigos ha cambiado, limpiar caché y forzar recarga
        if (previousUserData && 
            JSON.stringify(previousUserData.friends) !== JSON.stringify(currentUserData.friends)) {
          console.log("Lista de amigos actualizada, recargando datos");
          // Limpiar caché de amigos
          sessionStorage.removeItem('friends_data');
          sessionStorage.removeItem('friends_timestamp');
          // Forzar recarga con los nuevos datos
          fetchFriends(currentUserData);
        }
        
        // Actualizar referencia
        lastUserDataRef.current = currentUserData;
      }
    });
    
    return () => unsubscribe();
  }, [user?.uid]);

  // Función para obtener amigos - Ahora separada para poder llamarla después de aceptar solicitudes
  const fetchFriends = useCallback(async (currentUserData) => {
    // Usar userData del contexto si no se proporciona explícitamente
    const userDataToUse = currentUserData || userData;
    
    if (!userDataToUse?.friends || userDataToUse.friends.length === 0) {
      setFriends([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // Verificar si debemos saltarnos la caché (después de aceptar solicitud)
      const skipCache = currentUserData !== undefined;
      
      // Usar caché solo si no estamos forzando una recarga
      if (!skipCache) {
        const cachedFriendsData = sessionStorage.getItem('friends_data');
        const cachedTimestamp = sessionStorage.getItem('friends_timestamp');
        const now = Date.now();
        
        if (cachedFriendsData && cachedTimestamp && (now - parseInt(cachedTimestamp) < 300000)) {
          setFriends(JSON.parse(cachedFriendsData));
          setIsLoading(false);
          return;
        }
      }
      
      // Si no hay caché o necesitamos una recarga forzada
      const friendData = [];
      const batchSize = 10; // Procesar en lotes para evitar sobrecarga
      
      // Dividir amigos en lotes
      for (let i = 0; i < userDataToUse.friends.length; i += batchSize) {
        const batch = userDataToUse.friends.slice(i, i + batchSize);
        
        // Consulta optimizada con una sola consulta por lote usando 'in'
        const q = query(collection(db, "users"), where("username", "in", batch));
        const snapshot = await getDocs(q);
        
        snapshot.forEach(doc => {
          friendData.push(doc.data());
        });
      }
      
      setFriends(friendData);
      
      // Guardar en caché solo si no es una recarga forzada
      if (!skipCache) {
        sessionStorage.setItem('friends_data', JSON.stringify(friendData));
        sessionStorage.setItem('friends_timestamp', Date.now().toString());
      }
    } catch (error) {
      console.error("Error al obtener amigos:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userData]);

  // Efecto para cargar amigos al iniciar
  useEffect(() => {
    if (userData) {
      fetchFriends();
      // Guardar referencia inicial del userData
      lastUserDataRef.current = userData;
    }
  }, [userData, fetchFriends]);

  // Listener optimizado para el estado en línea de amigos
  useEffect(() => {
    if (!userData?.friends || userData.friends.length === 0) return;

    // Limitar el número de listeners activos a la vez
    const activeUsernames = userData.friends.slice(0, 20); // Limitar a 20 amigos activos
    const unsubscribers = {};

    activeUsernames.forEach((friendUsername) => {
      const unsubscribe = listenToUserStatus(friendUsername, (isOnline) => {
        setOnlineStatuses(prev => ({
          ...prev,
          [friendUsername]: isOnline
        }));
      });

      unsubscribers[friendUsername] = unsubscribe;
    });

    return () => {
      Object.values(unsubscribers).forEach(unsub => unsub && unsub());
    };
  }, [userData?.friends]);

  // Obtener grupos - Optimizado
  useEffect(() => {
    if (!userData) return;

    // Usamos una consulta más eficiente con límite
    const q = query(
      collection(db, "groups"),
      where("miembros", "array-contains", userData.username),
      limit(20) // Limitar a 20 grupos para mejorar rendimiento
    );

    const unsub = onSnapshot(q, (snap) => {
      const results = [];
      snap.forEach((doc) => results.push({ id: doc.id, ...doc.data() }));
      setGroups(results);
    });

    return () => unsub();
  }, [userData]);
  
  // Obtener solicitudes de amistad pendientes - Optimizado
  useEffect(() => {
    if (!userData) return;

    const q = query(
      collection(db, "friendRequests"),
      where("to", "==", userData.username),
      where("status", "==", "pending"),
      orderBy("timestamp", "desc"),
      limit(10) // Limitar a 10 solicitudes recientes
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingFriendRequests(requests);
    });

    return () => unsub();
  }, [userData]);

  // MEJORA CLAVE: Un solo listener para obtener últimos mensajes y conteo no leído
  useEffect(() => {
    if (!userData) return;
    
    // Un solo listener para todos los mensajes del usuario
    const messagesRef = collection(db, "messages");
    const q = query(
      messagesRef,
      where("participants", "array-contains", userData.username),
      orderBy("timestamp", "desc"),
      limit(50)  // Limitamos para optimizar pero aumentamos para capturar más conversaciones
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      // Usamos un objeto para agrupar por conversación
      const lastMessagesByPerson = {};
      const unreadCountsByPerson = {};
      
      // Procesar los mensajes
      snapshot.docs.forEach(docSnap => {
        const msg = docSnap.data();
        const otherPerson = msg.from === userData.username ? msg.to : msg.from;
        
        // Skip si es un mensaje de grupo
        if (!otherPerson) return;
        
        // Actualizar último mensaje de esta conversación
        if (!lastMessagesByPerson[otherPerson] || 
            (msg.timestamp && 
            (!lastMessagesByPerson[otherPerson].timestamp || 
            msg.timestamp.toDate() > lastMessagesByPerson[otherPerson].timestamp.toDate()))) {
          
          lastMessagesByPerson[otherPerson] = {
            text: msg.text || (msg.image ? "📷 Imagen" : ""),
            timestamp: msg.timestamp,
            from: msg.from,
            to: msg.to,
            unread: msg.to === userData.username && !msg.read
          };
        }
        
        // Contar mensajes no leídos
        if (msg.to === userData.username && !msg.read) {
          if (!unreadCountsByPerson[msg.from]) {
            unreadCountsByPerson[msg.from] = 0;
          }
          unreadCountsByPerson[msg.from]++;
        }
      });
      
      // Actualizar estado de última vista de un solo mensaje por conversación
      setLastMessages(prev => {
        // Combinar previo con nuevo, manteniendo otras entradas (como grupos)
        const newState = { ...prev };
        
        // Actualizar o añadir nuevas entradas
        Object.entries(lastMessagesByPerson).forEach(([person, msgData]) => {
          newState[person] = msgData;
        });
        
        return newState;
      });
      
      // Actualizar contador de no leídos
      setUnreadCounts(unreadCountsByPerson);
    });
    
    return () => unsub();
  }, [userData]);

  // Listener optimizado para mensajes de grupo
  useEffect(() => {
    if (!userData || groups.length === 0) return;
    
    const unsubscribers = [];
    
    // Limitar a 10 grupos activos para reducir consultas pero aumentar para mejor experiencia
    const activeGroups = groups.slice(0, 10);
    
    activeGroups.forEach(group => {
      const msgsRef = collection(db, "groupMessages", group.id, "messages");
      const groupLastMsgQuery = query(msgsRef, orderBy("timestamp", "desc"), limit(1));
      
      const unsubGroupLastMsg = onSnapshot(groupLastMsgQuery, (snapshot) => {
        if (!snapshot.empty) {
          const msgData = snapshot.docs[0].data();
          
          setLastMessages(prevState => ({
            ...prevState,
            [`group_${group.id}`]: {
              text: msgData.text || (msgData.image ? "📷 Imagen" : ""),
              timestamp: msgData.timestamp,
              from: msgData.from,
              unread: msgData.from !== userData.username
            }
          }));
        }
      });
      
      unsubscribers.push(unsubGroupLastMsg);
    });
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [userData, groups]);

  // Filtrar chats por búsqueda - Memoizado para evitar cálculos innecesarios
  const filteredFriends = useMemo(() => {
    return friends.filter(friend => 
      friend.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [friends, searchTerm]);
  
  const filteredGroups = useMemo(() => {
    return groups.filter(group => 
      group.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [groups, searchTerm]);

  // Formatear tiempo relativo
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "";
    
    const now = new Date();
    const messageDate = timestamp.toDate();
    const diffInMinutes = Math.floor((now - messageDate) / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    
    if (diffInMinutes < 1) return "ahora";
    else if (diffInMinutes < 60) return `${diffInMinutes} min`;
    else if (diffInHours < 24 && messageDate.getDate() === now.getDate()) {
      return messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    else if (diffInDays === 1) return "ayer";
    else if (diffInDays < 7) {
      const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
      return days[messageDate.getDay()];
    }
    else {
      return messageDate.toLocaleDateString([], { day: 'numeric', month: 'numeric' });
    }
  };

  // Verificar si un amigo está en línea
  const isOnline = (username) => {
    return onlineStatuses[username] || false;
  };

  // Manejar aceptación de solicitud de amistad - Mejorado para actualización en tiempo real
  const handleAcceptFriendRequest = async (req) => {
    try {
      const requestRef = doc(db, "friendRequests", req.id);
      await updateDoc(requestRef, { status: "accepted" });

      // Obtener referencias directas en lugar de consultas
      const userRef = collection(db, "users");
      const q1 = query(userRef, where("username", "==", userData.username));
      const q2 = query(userRef, where("username", "==", req.from));

      const [meSnap, senderSnap] = await Promise.all([getDocs(q1), getDocs(q2)]);

      if (!meSnap.empty && !senderSnap.empty) {
        const meDoc = meSnap.docs[0];
        const senderDoc = senderSnap.docs[0];

        const meFriends = meDoc.data().friends || [];
        const senderFriends = senderDoc.data().friends || [];

        // Actualizaciones en paralelo para mayor eficiencia
        await Promise.all([
          updateDoc(doc(db, "users", meDoc.id), {
            friends: [...new Set([...meFriends, req.from])]
          }),
          updateDoc(doc(db, "users", senderDoc.id), {
            friends: [...new Set([...senderFriends, userData.username])]
          })
        ]);
        
        // No necesitamos limpiar caché o forzar recarga aquí,
        // porque el listener del documento del usuario lo detectará y actualizará automáticamente
      }
    } catch (error) {
      console.error("Error al aceptar solicitud:", error);
    }
  };

  // Manejar rechazo de solicitud de amistad
  const handleRejectFriendRequest = async (req) => {
    try {
      await deleteDoc(doc(db, "friendRequests", req.id));
    } catch (error) {
      console.error("Error al rechazar solicitud:", error);
    }
  };

  // Ordenar la lista de amigos según diferentes criterios
  const sortedFriends = useMemo(() => {
    let sorted = [...filteredFriends];
    
    if (sortOrder === "recent") {
      // Ordenar por mensajes más recientes primero
      sorted.sort((a, b) => {
        const lastMsgA = lastMessages[a.username];
        const lastMsgB = lastMessages[b.username];
        
        // Primero priorizamos los no leídos
        const unreadA = unreadCounts[a.username] || 0;
        const unreadB = unreadCounts[b.username] || 0;
        
        if (unreadA > 0 && unreadB === 0) return -1;
        if (unreadA === 0 && unreadB > 0) return 1;
        
        // Si ambos tienen o no tienen no leídos, ordenar por timestamp
        if (!lastMsgA?.timestamp && !lastMsgB?.timestamp) return 0;
        if (!lastMsgA?.timestamp) return 1;
        if (!lastMsgB?.timestamp) return -1;
        
        return lastMsgB.timestamp.toDate() - lastMsgA.timestamp.toDate();
      });
    } else if (sortOrder === "unread") {
      // Ordenar por cantidad de mensajes no leídos
      sorted.sort((a, b) => {
        const unreadA = unreadCounts[a.username] || 0;
        const unreadB = unreadCounts[b.username] || 0;
        
        if (unreadA !== unreadB) {
          return unreadB - unreadA; // Mayor número de no leídos primero
        }
        
        // Si tienen mismo número de no leídos, ordenar por recientes
        const lastMsgA = lastMessages[a.username];
        const lastMsgB = lastMessages[b.username];
        
        if (!lastMsgA?.timestamp && !lastMsgB?.timestamp) return 0;
        if (!lastMsgA?.timestamp) return 1;
        if (!lastMsgB?.timestamp) return -1;
        
        return lastMsgB.timestamp.toDate() - lastMsgA.timestamp.toDate();
      });
    } else if (sortOrder === "alphabetical") {
      // Ordenar alfabéticamente
      sorted.sort((a, b) => a.username.localeCompare(b.username));
    } else if (sortOrder === "online") {
      // Ordenar por estado en línea
      sorted.sort((a, b) => {
        const isOnlineA = isOnline(a.username);
        const isOnlineB = isOnline(b.username);
        
        if (isOnlineA && !isOnlineB) return -1;
        if (!isOnlineA && isOnlineB) return 1;
        
        return 0;
      });
    }
    
    return sorted;
  }, [filteredFriends, lastMessages, unreadCounts, sortOrder, onlineStatuses]);

  // Lo mismo para grupos
  const sortedGroups = useMemo(() => {
    let sorted = [...filteredGroups];
    
    if (sortOrder === "recent" || sortOrder === "unread") {
      // Ordenar por actividad reciente
      sorted.sort((a, b) => {
        const lastMsgA = lastMessages[`group_${a.id}`];
        const lastMsgB = lastMessages[`group_${b.id}`];
        
        if (!lastMsgA?.timestamp && !lastMsgB?.timestamp) return 0;
        if (!lastMsgA?.timestamp) return 1;
        if (!lastMsgB?.timestamp) return -1;
        
        return lastMsgB.timestamp.toDate() - lastMsgA.timestamp.toDate();
      });
    } else if (sortOrder === "alphabetical") {
      // Ordenar alfabéticamente
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return sorted;
  }, [filteredGroups, lastMessages, sortOrder]);

  // Variable para saber si mostrar pantalla vacía o no
  const shouldShowEmptyState = (selectedTab === "friends" && filteredFriends.length === 0) || 
                            (selectedTab === "groups" && filteredGroups.length === 0);

  // Limpiar búsqueda
  const clearSearch = () => {
    setSearchTerm("");
  };

  // Refrescar amigos manualmente
  const refreshFriends = () => {
    // Limpiar caché de amigos
    sessionStorage.removeItem('friends_data');
    sessionStorage.removeItem('friends_timestamp');
    
    // Forzar recarga
    fetchFriends();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header con título y acciones principales */}
      <div className="sticky top-0 z-20 bg-gray-900 border-b border-gray-800 shadow-md">
        <div className="px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            {selectedTab === "friends" ? "Conversaciones" : "Grupos"}
          </h1>
          
          <div className="flex items-center space-x-2">
            {/* Acciones del encabezado: mostrar más en pantallas grandes */}
            <div className="hidden md:flex items-center space-x-2">
              <button 
                onClick={refreshFriends}
                className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-full"
                title="Refrescar"
              >
                <MdRefresh size={20} />
              </button>
              
              {selectedTab === "friends" ? (
                <AddFriend className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-full" />
              ) : (
                <CreateGroupButton className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-full" />
              )}
              
              {pendingFriendRequests.length > 0 && (
                <button
                  onClick={() => setShowFriendRequestsModal(true)}
                  className="relative p-2 text-indigo-400 hover:text-indigo-300 bg-gray-800 rounded-full"
                  title="Solicitudes de amistad"
                >
                  <MdNotifications size={20} />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-xs text-white rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingFriendRequests.length}
                  </span>
                </button>
              )}
            </div>
            
            {/* Botón de menú móvil */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-full relative"
            >
              {pendingFriendRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-xs text-white rounded-full h-4 w-4 flex items-center justify-center">
                  {pendingFriendRequests.length}
                </span>
              )}
              <MdMoreVert size={20} />
            </button>
          </div>
        </div>
        
        {/* Barra de búsqueda y filtros */}
        <div className="px-4 py-2 flex items-center space-x-2">
          <div className="relative flex-1">
            <MdSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder={`Buscar ${selectedTab === "friends" ? "conversaciones" : "grupos"}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded-full py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            {searchTerm && (
              <button 
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
                onClick={clearSearch}
              >
                <MdClose size={18} />
              </button>
            )}
          </div>
          
          {/* Botón de filtro */}
          <div className="relative" ref={filterMenuRef}>
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="p-2 bg-gray-800 border border-gray-700 text-gray-300 hover:text-gray-100 rounded-full"
              title="Ordenar"
            >
              <MdFilterList size={20} />
            </button>
            
            {/* Menú de filtro */}
            {showFilterMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 py-1 overflow-hidden animate-fade-in-down">
                <button
                  onClick={() => {
                    setSortOrder("recent");
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex items-center ${sortOrder === "recent" ? "text-indigo-400" : "text-gray-300"}`}
                >
                  {sortOrder === "recent" && <MdCheckCircle className="mr-2" size={16} />}
                  <span className={sortOrder === "recent" ? "ml-5" : "ml-7"}>Recientes</span>
                </button>
                <button
                  onClick={() => {
                    setSortOrder("unread");
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex items-center ${sortOrder === "unread" ? "text-indigo-400" : "text-gray-300"}`}
                >
                  {sortOrder === "unread" && <MdCheckCircle className="mr-2" size={16} />}
                  <span className={sortOrder === "unread" ? "ml-5" : "ml-7"}>No leídos</span>
                </button>
                <button
                  onClick={() => {
                    setSortOrder("alphabetical");
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex items-center ${sortOrder === "alphabetical" ? "text-indigo-400" : "text-gray-300"}`}
                >
                  {sortOrder === "alphabetical" && <MdCheckCircle className="mr-2" size={16} />}
                  <span className={sortOrder === "alphabetical" ? "ml-5" : "ml-7"}>Alfabético</span>
                </button>
                <button
                  onClick={() => {
                    setSortOrder("online");
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex items-center ${sortOrder === "online" ? "text-indigo-400" : "text-gray-300"}`}
                >
                  {sortOrder === "online" && <MdCheckCircle className="mr-2" size={16} />}
                  <span className={sortOrder === "online" ? "ml-5" : "ml-7"}>En línea</span>
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Menú móvil expandible con acciones */}
        {showMobileMenu && (
          <div className="md:hidden bg-gray-800 py-2 px-3 transition-all animate-fade-in-down border-t border-gray-700">
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => {
                  setShowFriendRequestsModal(true);
                  setShowMobileMenu(false);
                }}
                className="flex flex-col items-center p-2 rounded bg-gray-750 hover:bg-gray-700 relative"
              >
                <MdNotifications size={20} className="text-indigo-400 mb-1" />
                <span className="text-xs text-gray-300">Solicitudes</span>
                {pendingFriendRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-xs text-white rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingFriendRequests.length}
                  </span>
                )}
              </button>
              
              <button 
                onClick={refreshFriends}
                className="flex flex-col items-center p-2 rounded bg-gray-750 hover:bg-gray-700"
              >
                <MdRefresh size={20} className="text-gray-400 mb-1" />
                <span className="text-xs text-gray-300">Refrescar</span>
              </button>
              
              {selectedTab === "friends" ? (
                <button 
                  onClick={() => {
                    const addFriendButton = document.querySelector('[data-add-friend-button]');
                    if (addFriendButton) {
                      addFriendButton.click();
                    }
                    setShowMobileMenu(false);
                  }}
                  className="flex flex-col items-center p-2 rounded bg-gray-750 hover:bg-gray-700"
                >
                  <MdPersonAdd size={20} className="text-indigo-400 mb-1" />
                  <span className="text-xs text-gray-300">Agregar amigo</span>
                </button>
              ) : (
                <button 
                  onClick={() => {
                    const createGroupButton = document.querySelector('[data-create-group-button]');
                    if (createGroupButton) {
                      createGroupButton.click();
                    }
                    setShowMobileMenu(false);
                  }}
                  className="flex flex-col items-center p-2 rounded bg-gray-750 hover:bg-gray-700"
                >
                  <MdAdd size={20} className="text-indigo-400 mb-1" />
                  <span className="text-xs text-gray-300">Crear grupo</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pestañas de navegación */}
      <div className="flex border-b border-gray-800 sticky top-[110px] z-10 bg-gray-900 shadow-sm">
        <button
          onClick={() => setSelectedTab("friends")}
          className={`flex-1 py-3 flex justify-center items-center gap-2 ${
            selectedTab === "friends" ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-gray-300'
          } transition-colors duration-200`}
        >
          <MdPeopleAlt size={20} />
          <span className="font-medium">Amigos</span>
        </button>
        <button
          onClick={() => setSelectedTab("groups")}
          className={`flex-1 py-3 flex justify-center items-center gap-2 ${
            selectedTab === "groups" ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-gray-300'
          } transition-colors duration-200`}
        >
          <MdGroups size={20} />
          <span className="font-medium">Grupos</span>
        </button>
      </div>

      {/* Contenido: Lista de chats con estado de carga */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full py-10 px-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
            <p className="text-gray-400 text-center">Cargando tus {selectedTab === "friends" ? "conversaciones" : "grupos"}...</p>
          </div>
        ) : shouldShowEmptyState ? (
          <div className="flex flex-col items-center justify-center h-full py-20 px-4">
            {selectedTab === "friends" ? (
              <>
                <div className="bg-gray-800 rounded-full p-6 mb-4">
                  <MdPeopleAlt className="text-indigo-400" size={40} />
                </div>
                <h3 className="text-xl font-bold mb-2 text-gray-200">No hay amigos para mostrar</h3>
                <p className="text-gray-400 text-center max-w-md mb-6">Agrega amigos para comenzar a chatear y mantenerte en contacto.</p>
                <AddFriend data-add-friend-button />
              </>
            ) : (
              <>
                <div className="bg-gray-800 rounded-full p-6 mb-4">
                  <MdGroups className="text-indigo-400" size={40} />
                </div>
                <h3 className="text-xl font-bold mb-2 text-gray-200">No hay grupos para mostrar</h3>
                <p className="text-gray-400 text-center max-w-md mb-6">Crea un grupo para chatear con varios amigos a la vez.</p>
                <CreateGroupButton data-create-group-button />
              </>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {/* Lista de amigos */}
            {selectedTab === "friends" && (
              sortedFriends.map((friend) => (
                <div
                  id={`friend-${friend.username}`}
                  key={friend.username}
                  onClick={() => handleNavigation(`/chat/${friend.username}`, `friend-${friend.username}`)}
                  className={`flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors active:bg-indigo-700
                    ${unreadCounts[friend.username] ? 'bg-gray-800 bg-opacity-70' : ''}
                  `}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleNavigation(`/chat/${friend.username}`, `friend-${friend.username}`);
                    }
                  }}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                      {friend.photoURL ? (
                        <img src={friend.photoURL} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-300">😶</div>
                      )}
                    </div>
                    {isOnline(friend.username) ? (
                      <div className="absolute bottom-0 right-0 bg-green-500 w-3.5 h-3.5 rounded-full border-2 border-gray-900"></div>
                    ) : (
                      <div className="absolute bottom-0 right-0 bg-gray-500 w-3.5 h-3.5 rounded-full border-2 border-gray-900"></div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <span className={`font-medium truncate ${unreadCounts[friend.username] ? 'text-white' : 'text-gray-200'}`}>
                          {friend.username}
                        </span>
                        <Staff username={friend.username} />
                      </div>
                      <span className="text-xs text-gray-400">
                        {lastMessages[friend.username]?.timestamp ? 
                          formatRelativeTime(lastMessages[friend.username].timestamp) : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <p className={`text-sm truncate max-w-[70%] ${
                        lastMessages[friend.username]?.unread ? 'text-gray-100 font-medium' : 'text-gray-400'
                      }`}>
                        {lastMessages[friend.username]?.from === userData.username && (
                          <span className="text-gray-400 mr-1">Tú:</span>
                        )}
                        {lastMessages[friend.username]?.text || 'No hay mensajes aún'}
                      </p>
                      {unreadCounts[friend.username] > 0 && (
                        <span className="bg-indigo-600 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                          {unreadCounts[friend.username]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {/* Lista de grupos */}
            {selectedTab === "groups" && (
              sortedGroups.map((group) => (
                <div
                  id={`group-${group.id}`}
                  key={group.id}
                  onClick={() => handleNavigation(`/chat/group/${group.id}`, `group-${group.id}`)}
                  className={`flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors active:bg-indigo-700
                    ${lastMessages[`group_${group.id}`]?.unread ? 'bg-gray-800 bg-opacity-70' : ''}
                  `}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleNavigation(`/chat/group/${group.id}`, `group-${group.id}`);
                    }
                  }}
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex-shrink-0 flex items-center justify-center">
                    <span className="text-xl">👥</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className={`font-medium truncate ${lastMessages[`group_${group.id}`]?.unread ? 'text-white' : 'text-gray-200'}`}>
                        {group.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {lastMessages[`group_${group.id}`]?.timestamp ? 
                          formatRelativeTime(lastMessages[`group_${group.id}`].timestamp) : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <p className={`text-sm truncate max-w-[70%] ${
                        lastMessages[`group_${group.id}`]?.unread ? 'text-gray-100 font-medium' : 'text-gray-400'
                      }`}>
                        {lastMessages[`group_${group.id}`]?.from ? (
                          <span>
                            {lastMessages[`group_${group.id}`].from === userData.username ? (
                              <span className="text-gray-400 mr-1">Tú:</span>
                            ) : (
                              <span className="font-medium mr-1">{lastMessages[`group_${group.id}`].from}:</span>
                            )}
                            {lastMessages[`group_${group.id}`].text}
                          </span>
                        ) : (
                          'No hay mensajes aún'
                        )}
                      </p>
                      {lastMessages[`group_${group.id}`]?.unread && (
                        <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5">
                          nuevo
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {/* Espacio extra al final para evitar que el botón flotante tape el último elemento */}
            <div className="h-16"></div>
          </div>
        )}
      </div>

      {/* Botones flotantes (versión mejorada) */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3">
        {/* Mostrar un indicador de solicitudes de amistad pendientes flotante */}
        {pendingFriendRequests.length > 0 && (
          <button
            onClick={() => setShowFriendRequestsModal(true)}
            className="relative bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg rounded-full p-3"
            title="Solicitudes de amistad"
          >
            <MdNotifications size={20} />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
              {pendingFriendRequests.length}
            </span>
          </button>
        )}
        
        {/* Botón para agregar amigo o crear grupo según el tab */}
        {selectedTab === "friends" ? (
          <AddFriend 
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg rounded-full p-3" 
            data-add-friend-button
          />
        ) : (
          <CreateGroupButton 
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg rounded-full p-3" 
            data-create-group-button
          />
        )}
      </div>

      {/* Modal de solicitudes de amistad */}
      {showFriendRequestsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-md shadow-lg overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
              <h2 className="text-xl font-bold flex items-center">
                <MdNotifications className="mr-2" size={22} />
                Solicitudes de amistad
              </h2>
            </div>

            <div className="p-4">
              {pendingFriendRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-400 flex flex-col items-center">
                  <MdPeopleAlt size={40} className="mb-3 text-gray-600" />
                  <p>No tienes solicitudes pendientes.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {pendingFriendRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center gap-3 bg-gray-750 p-3 rounded-lg border border-gray-700"
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                        {req.photoURL ? (
                          <img src={req.photoURL} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm text-gray-300">😶</div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-200 truncate">{req.from}</p>
                        <p className="text-xs text-gray-400">
                          {req.timestamp ? formatRelativeTime(req.timestamp.toDate()) : 'Hace un momento'}
                        </p>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => handleAcceptFriendRequest(req)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                        >
                          Aceptar
                        </button>
                        <button
                          onClick={() => handleRejectFriendRequest(req)}
                          className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded text-sm transition-colors"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-gray-700 flex justify-end">
                <button
                  onClick={() => setShowFriendRequestsModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}