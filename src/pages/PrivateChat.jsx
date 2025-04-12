import { useParams, useNavigate } from "react-router-dom";
import { useContext, useState, useEffect, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import MessageHandler from "../components/MessageHandler";
import BlockUser from "../components/BlockUser";
import { db } from "../firebase/config";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  onSnapshot,
  orderBy,
  doc,
  getDoc
} from "firebase/firestore";
import { 
  MdArrowBack, 
  MdMoreVert, 
  MdCall, 
  MdVideocam, 
  MdClose, 
  MdBlock,
  MdInfoOutline,
} from "react-icons/md";
import { HiSpeakerWave, HiSpeakerXMark } from "react-icons/hi2";
import { listenToUserStatus } from "../utils/onlineStatus";
import { toast } from "react-toastify";

export default function PrivateChat() {
  const { username } = useParams();
  const { userData } = useContext(AuthContext);
  const navigate = useNavigate();
  const [receiverData, setReceiverData] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isUserOnline, setIsUserOnline] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  
  const menuRef = useRef(null);
  const userInfoRef = useRef(null);
  
  // Verificar estado de bloqueo al cargar y en tiempo real
  useEffect(() => {
    if (!userData || !username) return;

    const checkBlockStatus = async () => {
      try {
        // Verificar si el usuario actual ha bloqueado al receptor
        const blockDocRef = doc(db, "blockedUsers", `${userData.username}_${username}`);
        const blockDoc = await getDoc(blockDocRef);
        setIsBlocked(blockDoc.exists());

        // Verificar si el receptor ha bloqueado al usuario actual
        const reverseBlockDocRef = doc(db, "blockedUsers", `${username}_${userData.username}`);
        const reverseBlockDoc = await getDoc(reverseBlockDocRef);
        setHasBlockedMe(reverseBlockDoc.exists());
      } catch (error) {
        console.error("Error al verificar estado de bloqueo:", error);
      }
    };

    // Verificación inicial
    checkBlockStatus();

    // Configurar listener para cambios en la colección de usuarios bloqueados
    const blockRef = collection(db, "blockedUsers");
    const q1 = query(blockRef, where("blocker", "==", userData.username), where("blocked", "==", username));
    const q2 = query(blockRef, where("blocker", "==", username), where("blocked", "==", userData.username));

    const unsubscribe1 = onSnapshot(q1, (snapshot) => {
      setIsBlocked(!snapshot.empty);
    });

    const unsubscribe2 = onSnapshot(q2, (snapshot) => {
      setHasBlockedMe(!snapshot.empty);
    });

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [userData, username]);

  // Verificar estado de silenciado
  useEffect(() => {
    if (!userData) return;
    
    const checkMuteStatus = async () => {
      try {
        // Obtener las preferencias de usuario
        const userPrefsRef = doc(db, "userPreferences", userData.username);
        const userPrefsSnap = await getDoc(userPrefsRef);
        
        if (userPrefsSnap.exists()) {
          const data = userPrefsSnap.data();
          const mutedUsers = data.mutedUsers || [];
          setIsMuted(mutedUsers.includes(username));
        } else {
          setIsMuted(false);
        }
      } catch (error) {
        console.error("Error al verificar estado de silenciado:", error);
        setIsMuted(false);
      }
    };
    
    checkMuteStatus();
  }, [userData, username]);

  // Cierre del menú al hacer clic fuera de él
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Para el menú móvil
      if (menuRef.current && !menuRef.current.contains(event.target) && 
          !event.target.closest('[data-menu-toggle]')) {
        setShowMobileMenu(false);
      }
      
      // Para el panel de información del usuario (sólo en móvil)
      // No cerramos al hacer clic fuera para evitar cierres accidentales durante el bloqueo
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch receiver's data
  useEffect(() => {
    const fetchReceiverData = async () => {
      try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setReceiverData(snapshot.docs[0].data());
        }
      } catch (error) {
        console.error("Error fetching receiver data:", error);
        toast.error("No se pudo cargar información del usuario");
      }
    };
    
    fetchReceiverData();
  }, [username]);

  // Listen to user's online status
  useEffect(() => {
    const unsubscribe = listenToUserStatus(username, (online) => {
      setIsUserOnline(online);
    });

    return () => unsubscribe();
  }, [username]);

  // Marcar mensajes como leídos al entrar al chat (solo si no hay bloqueo)
  useEffect(() => {
    if (!userData || isBlocked) return;

    const messagesRef = collection(db, "messages");
    const q = query(
      messagesRef,
      where("from", "==", username),
      where("to", "==", userData.username),
      where("read", "==", false),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) return;
      
      // Actualizar último mensaje visto
      const lastMsg = snapshot.docs[0].data();
      if (lastMsg.timestamp) {
        setLastSeen(lastMsg.timestamp);
      }
      
      // Marcar mensajes como leídos en un batch
      try {
        for (const docSnap of snapshot.docs) {
          await updateDoc(doc(db, "messages", docSnap.id), { read: true });
        }
      } catch (error) {
        console.error("Error al marcar mensajes como leídos:", error);
      }
    });

    return () => unsubscribe();
  }, [userData, username, isBlocked]);

  // Función para manejar silenciar notificaciones
  const toggleMuteStatus = async () => {
    try {
      // Obtener preferencias actuales
      const userPrefsRef = doc(db, "userPreferences", userData.username);
      const userPrefsSnap = await getDoc(userPrefsRef);
      
      let mutedUsers = [];
      
      if (userPrefsSnap.exists() && userPrefsSnap.data().mutedUsers) {
        mutedUsers = [...userPrefsSnap.data().mutedUsers];
      }
      
      // Actualizar la lista de usuarios silenciados
      if (isMuted) {
        // Quitar de la lista de silenciados
        mutedUsers = mutedUsers.filter(user => user !== username);
        toast.success(`Notificaciones activadas para ${username}`);
      } else {
        // Añadir a la lista de silenciados
        if (!mutedUsers.includes(username)) {
          mutedUsers.push(username);
        }
        toast.success(`${username} ha sido silenciado`);
      }
      
      // Guardar cambios en Firestore
      if (userPrefsSnap.exists()) {
        await updateDoc(userPrefsRef, {
          mutedUsers: mutedUsers
        });
      } else {
        await setDoc(userPrefsRef, {
          mutedUsers: mutedUsers
        });
      }
      
      // Actualizar el estado local
      setIsMuted(!isMuted);
      
    } catch (error) {
      console.error("Error al actualizar estado de silencio:", error);
      toast.error("Error al cambiar notificaciones");
    }
  };

  // Cambiar entre móvil y escritorio para info de usuario
  const toggleUserInfo = () => {
    setShowUserInfo(!showUserInfo);
    setShowMobileMenu(false);
  };

  // Navegar atrás
  const goBack = () => {
    navigate("/chat");
  };

  // Determinar si hay algún tipo de bloqueo activo
  const isAnyBlockActive = isBlocked || hasBlockedMe;

  // Manejar cambios en el estado de bloqueo
  const handleBlockStatusChange = (newStatus) => {
    setIsBlocked(newStatus);
    
    // Si acabamos de bloquear al usuario, podemos cerrar el panel de información
    // pero sólo si estamos en escritorio para evitar problemas
    if (newStatus && window.innerWidth >= 768) {
      setShowUserInfo(false);
    }
  };

  // Formatear última vez visto
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return "Desconectado";
    
    const now = new Date();
    const lastSeenDate = timestamp.toDate();
    const diffInMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Ahora";
    if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
    
    // Si es más de un día, mostrar la fecha
    return lastSeenDate.toLocaleDateString();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100 w-full overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-800 to-gray-900 px-2 sm:px-4 py-3 shadow-md flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <button 
            onClick={goBack}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-colors"
            aria-label="Go back"
          >
            <MdArrowBack size={24} />
          </button>
          
          <button 
            className="flex items-center space-x-2"
            onClick={toggleUserInfo}
            data-user-info-toggle
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                {receiverData?.photoURL ? (
                  <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-300">😶</div>
                )}
              </div>
              {isUserOnline && !isAnyBlockActive ? (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></div>
              ) : (
                isAnyBlockActive ? (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-800"></div>
                ) : (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-gray-500 rounded-full border-2 border-gray-800"></div>
                )
              )}
            </div>
            
            <div className="text-left">
              <div className="flex items-center">
                <h2 className="font-medium text-gray-100 truncate max-w-[120px] sm:max-w-[140px] md:max-w-full">
                  {username}
                </h2>
                {isBlocked && (
                  <span className="ml-2 text-xs bg-red-500 text-white px-1 py-0.5 rounded">Bloqueado</span>
                )}
                {hasBlockedMe && (
                  <span className="ml-2 text-xs bg-gray-500 text-white px-1 py-0.5 rounded">Te bloqueó</span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {isAnyBlockActive ? (
                  "Bloqueado"
                ) : (
                  isUserOnline ? (
                    "En línea"
                  ) : (
                    lastSeen ? `Última vez: ${formatLastSeen(lastSeen)}` : "Desconectado"
                  )
                )}
              </p>
            </div>
          </button>
        </div>
        
        <div className="flex items-center space-x-1">
          {/* Acciones de escritorio */}
          <div className="hidden sm:flex items-center space-x-1">
            <button 
              className={`text-gray-400 p-2 rounded-full ${isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : 'hover:text-white hover:bg-gray-700'}`}
              aria-label="Call"
              disabled={isAnyBlockActive}
              title="Llamar"
            >
              <MdCall size={20} />
            </button>
            <button 
              className={`text-gray-400 p-2 rounded-full ${isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : 'hover:text-white hover:bg-gray-700'}`}
              aria-label="Video call"
              disabled={isAnyBlockActive}
              title="Videollamada"
            >
              <MdVideocam size={20} />
            </button>
            <button 
              onClick={toggleMuteStatus}
              className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700"
              title={isMuted ? "Activar notificaciones" : "Silenciar notificaciones"}
            >
              {isMuted ? (
                <HiSpeakerXMark size={20} />
              ) : (
                <HiSpeakerWave size={20} />
              )}
            </button>
            <button 
              onClick={toggleUserInfo}
              className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700"
              aria-label="User info"
              data-user-info-toggle
            >
              <MdInfoOutline size={20} />
            </button>
          </div>
          
          {/* Botón de menú en móvil */}
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="sm:hidden text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 relative"
            data-menu-toggle
          >
            <MdMoreVert size={20} />
          </button>
          
          {/* Menú desplegable en móvil */}
          {showMobileMenu && (
            <div className="absolute top-14 right-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-40 w-48 overflow-hidden animate-fade-in-down"
                 ref={menuRef}>
              <div className="py-1">
                <button
                  onClick={() => {
                    toggleUserInfo();
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  <MdInfoOutline size={18} className="mr-2" />
                  Ver perfil
                </button>
                <button
                  onClick={() => {
                    toggleMuteStatus();
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  {isMuted ? (
                    <>
                      <HiSpeakerWave size={18} className="mr-2" />
                      Activar notificaciones
                    </>
                  ) : (
                    <>
                      <HiSpeakerXMark size={18} className="mr-2" />
                      Silenciar notificaciones
                    </>
                  )}
                </button>
                <button
                  disabled={isAnyBlockActive}
                  className={`w-full flex items-center px-4 py-2 text-sm ${
                    isAnyBlockActive ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <MdCall size={18} className="mr-2" />
                  Llamar
                </button>
                <button
                  disabled={isAnyBlockActive}
                  className={`w-full flex items-center px-4 py-2 text-sm ${
                    isAnyBlockActive ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <MdVideocam size={18} className="mr-2" />
                  Videollamada
                </button>
                <div className="border-t border-gray-700 mt-1 pt-1">
                  <BlockUser 
                    username={username} 
                    onBlockStatusChange={handleBlockStatusChange}
                    isMobileMenu={true}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Chat Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main chat content */}
        <div className="flex-1 flex flex-col">
          {/* Mensaje de bloqueo */}
          {isAnyBlockActive && (
            <div className="bg-red-900 bg-opacity-75 p-4 text-white text-center">
              {isBlocked ? (
                <div className="flex items-center justify-center space-x-2">
                  <MdBlock size={20} />
                  <span>Has bloqueado a este usuario. No puedes enviar ni recibir mensajes.</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <MdBlock size={20} />
                  <span>Este usuario te ha bloqueado. No puedes enviar mensajes.</span>
                </div>
              )}
            </div>
          )}

          {/* Utilizar MessageHandler para el manejo de mensajes */}
          <div className="flex-1 overflow-y-auto bg-gray-900">
            <MessageHandler 
              receiver={username} 
              isBlocked={isAnyBlockActive} 
            />
          </div>
        </div>
        
        {/* User info sidebar (desktop) */}
        {showUserInfo && (
          <div className="hidden md:block w-80 bg-gray-800 border-l border-gray-700 animate-slide-in-right overflow-y-auto" ref={userInfoRef}>
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Información de usuario</h3>
                <button 
                  onClick={() => setShowUserInfo(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"
                >
                  <MdClose size={20} />
                </button>
              </div>
              
              {receiverData ? (
                <div className="space-y-4">
                  {/* Perfil */}
                  <div className="flex flex-col items-center bg-gray-750 p-4 rounded-lg border border-gray-700">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-700 mb-3">
                      {receiverData.photoURL ? (
                        <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">😶</div>
                      )}
                    </div>
                    <h4 className="text-xl font-bold text-white truncate max-w-full">
                      {username}
                    </h4>
                    <p className="text-sm text-gray-400 mt-1">
                      {isAnyBlockActive ? "Bloqueado" : (isUserOnline ? "En línea" : "Desconectado")}
                    </p>
                    
                    {/* Insignias o información adicional */}
                    <div className="flex gap-2 mt-2">
                      <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                        Usuario desde {receiverData.joinDate ? new Date(receiverData.joinDate.toDate()).toLocaleDateString() : "..."}
                      </span>
                    </div>
                  </div>
                  
                  {/* Información de contacto */}
                  <div className="bg-gray-750 p-4 rounded-lg border border-gray-700 space-y-3">
                    <h5 className="font-medium text-gray-200 mb-2">Información de contacto</h5>
                    
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Correo</label>
                      <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                        {receiverData.email || "No disponible"}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Estado</label>
                      <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                        {receiverData.status || "Sin estado"}
                      </div>
                    </div>
                  </div>
                  
                  {/* Acciones */}
                  <div className="space-y-2">
                    <button 
                      onClick={toggleMuteStatus}
                      className="w-full py-2 bg-gray-750 hover:bg-gray-700 rounded text-gray-300 transition-colors flex items-center justify-center space-x-2"
                    >
                      {isMuted ? (
                        <>
                          <HiSpeakerWave size={18} />
                          <span>Activar notificaciones</span>
                        </>
                      ) : (
                        <>
                          <HiSpeakerXMark size={18} />
                          <span>Silenciar notificaciones</span>
                        </>
                      )}
                    </button>
                    
                    <BlockUser 
                      username={username} 
                      onBlockStatusChange={handleBlockStatusChange} 
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* User info modal (mobile) */}
        {showUserInfo && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-50 flex justify-end animate-fade-in-down">
            <div className="w-[85%] max-w-xs bg-gray-800 h-full animate-slide-in-right overflow-y-auto" ref={userInfoRef} onClick={(e) => e.stopPropagation()}>
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white">Información de usuario</h3>
                  <button 
                    onClick={() => setShowUserInfo(false)}
                    className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"
                  >
                    <MdClose size={20} />
                  </button>
                </div>
                
                {receiverData ? (
                  <div className="space-y-4">
                    {/* Perfil */}
                    <div className="flex flex-col items-center bg-gray-750 p-4 rounded-lg border border-gray-700">
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-700 mb-3">
                        {receiverData.photoURL ? (
                          <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">😶</div>
                        )}
                      </div>
                      <h4 className="text-xl font-bold text-white truncate max-w-full">
                        {username}
                      </h4>
                      <p className="text-sm text-gray-400 mt-1">
                        {isAnyBlockActive ? "Bloqueado" : (isUserOnline ? "En línea" : "Desconectado")}
                      </p>
                      
                      {/* Insignias o información adicional */}
                      <div className="flex gap-2 mt-2">
                        <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                          Usuario desde {receiverData.joinDate ? new Date(receiverData.joinDate.toDate()).toLocaleDateString() : "..."}
                        </span>
                      </div>
                    </div>
                    
                    {/* Información de contacto */}
                    <div className="bg-gray-750 p-4 rounded-lg border border-gray-700 space-y-3">
                      <h5 className="font-medium text-gray-200 mb-2">Información de contacto</h5>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Correo</label>
                        <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                          {receiverData.email || "No disponible"}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Estado</label>
                        <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                          {receiverData.status || "Sin estado"}
                        </div>
                      </div>
                    </div>
                    
                    {/* Acciones */}
                    <div className="space-y-2">
                      <button 
                        onClick={toggleMuteStatus}
                        className="w-full py-2 bg-gray-750 hover:bg-gray-700 rounded text-gray-300 transition-colors flex items-center justify-center space-x-2"
                      >
                        {isMuted ? (
                          <>
                            <HiSpeakerWave size={18} />
                            <span>Activar notificaciones</span>
                          </>
                        ) : (
                          <>
                            <HiSpeakerXMark size={18} />
                            <span>Silenciar notificaciones</span>
                          </>
                        )}
                      </button>
                      
                      <BlockUser 
                        username={username} 
                        onBlockStatusChange={handleBlockStatusChange} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );MdImage,
  MdSend,
  MdDelete,
  MdKeyboardArrowDown
} from "react-icons/md";
import { HiCheck, HiSpeakerWave, HiSpeakerXMark } from "react-icons/hi2";
import { listenToUserStatus } from "../utils/onlineStatus";
import Staff from "../components/Staff";
import {
  ReplyPreview,
  MessageInput
} from "../components/messages";
import { toast } from "react-toastify";

export default function PrivateChat() {
  const { username } = useParams();
  const { userData } = useContext(AuthContext);
  const navigate = useNavigate();
  const [receiverData, setReceiverData] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isUserOnline, setIsUserOnline] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [lastSeen, setLastSeen] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const menuRef = useRef(null);
  const userInfoRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  
  // Verificar estado de bloqueo al cargar y en tiempo real
  useEffect(() => {
    if (!userData || !username) return;

    const checkBlockStatus = async () => {
      try {
        // Verificar si el usuario actual ha bloqueado al receptor
        const blockDocRef = doc(db, "blockedUsers", `${userData.username}_${username}`);
        const blockDoc = await getDoc(blockDocRef);
        setIsBlocked(blockDoc.exists());

        // Verificar si el receptor ha bloqueado al usuario actual
        const reverseBlockDocRef = doc(db, "blockedUsers", `${username}_${userData.username}`);
        const reverseBlockDoc = await getDoc(reverseBlockDocRef);
        setHasBlockedMe(reverseBlockDoc.exists());
      } catch (error) {
        console.error("Error al verificar estado de bloqueo:", error);
      }
    };

    // Verificación inicial
    checkBlockStatus();

    // Configurar listener para cambios en la colección de usuarios bloqueados
    const blockRef = collection(db, "blockedUsers");
    const q1 = query(blockRef, where("blocker", "==", userData.username), where("blocked", "==", username));
    const q2 = query(blockRef, where("blocker", "==", username), where("blocked", "==", userData.username));

    const unsubscribe1 = onSnapshot(q1, (snapshot) => {
      setIsBlocked(!snapshot.empty);
    });

    const unsubscribe2 = onSnapshot(q2, (snapshot) => {
      setHasBlockedMe(!snapshot.empty);
    });

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [userData, username]);

  // Cierre del menú al hacer clic fuera de él
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMobileMenu(false);
      }
      
      if (userInfoRef.current && !userInfoRef.current.contains(event.target) && 
          event.target.closest('[data-user-info-toggle]') === null) {
        setShowUserInfo(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch receiver's data
  useEffect(() => {
    const fetchReceiverData = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setReceiverData(snapshot.docs[0].data());
        }
      } catch (error) {
        console.error("Error fetching receiver data:", error);
        toast.error("No se pudo cargar información del usuario");
      } finally {
        setLoading(false);
      }
    };
    
    fetchReceiverData();
  }, [username]);

  // Listen to user's online status
  useEffect(() => {
    const unsubscribe = listenToUserStatus(username, (online) => {
      setIsUserOnline(online);
    });

    return () => unsubscribe();
  }, [username]);

  // Función para manejar silenciar notificaciones
  const toggleMuteStatus = async () => {
    try {
      // Obtener preferencias actuales
      const userPrefsRef = doc(db, "userPreferences", userData.username);
      const userPrefsSnap = await getDoc(userPrefsRef);
      
      let mutedUsers = [];
      
      if (userPrefsSnap.exists() && userPrefsSnap.data().mutedUsers) {
        mutedUsers = [...userPrefsSnap.data().mutedUsers];
      }
      
      // Actualizar la lista de usuarios silenciados
      if (isMuted) {
        // Quitar de la lista de silenciados
        mutedUsers = mutedUsers.filter(user => user !== username);
        toast.success(`Notificaciones activadas para ${username}`);
      } else {
        // Añadir a la lista de silenciados
        if (!mutedUsers.includes(username)) {
          mutedUsers.push(username);
        }
        toast.success(`${username} ha sido silenciado`);
      }
      
      // Guardar cambios en Firestore
      if (userPrefsSnap.exists()) {
        await updateDoc(userPrefsRef, {
          mutedUsers: mutedUsers
        });
      } else {
        await setDoc(userPrefsRef, {
          mutedUsers: mutedUsers
        });
      }
      
      // Actualizar el estado local
      setIsMuted(!isMuted);
      
    } catch (error) {
      console.error("Error al actualizar estado de silencio:", error);
      toast.error("Error al cambiar notificaciones");
    }
  };

  // Cargar los mensajes
  useEffect(() => {
    if (!userData) return;

    const messagesRef = collection(db, "messages");
    const q = query(
      messagesRef,
      where("participants", "array-contains", userData.username),
      orderBy("timestamp", "asc")
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const filtered = [];
      const unreadMessages = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        const isBetween =
          (data.from === userData.username && data.to === username) ||
          (data.from === username && data.to === userData.username);

        if (isBetween) {
          if (data.to === userData.username && !data.read) {
            unreadMessages.push(docSnap.id);
          }

          filtered.push({ ...data, id: docSnap.id });
        }
      }

      // Actualizar mensajes
      setMessages(filtered);
      
      // Actualizar último mensaje visto si hay mensajes
      if (filtered.length > 0) {
        const lastMsg = filtered[filtered.length - 1];
        if (lastMsg.from === username) {
          setLastSeen(lastMsg.timestamp);
        }
      }
      
      // Verificar si hay nuevos mensajes para mostrar contador
      if (filtered.length > lastMessageCountRef.current) {
        const newMessages = filtered.slice(lastMessageCountRef.current);
        const incomingMessages = newMessages.filter(msg => msg.from === username);
        
        if (incomingMessages.length > 0 && !isUserAtBottom()) {
          setNewMessageCount(prev => prev + incomingMessages.length);
        }
      }
      
      // Actualizar referencia de contador
      lastMessageCountRef.current = filtered.length;
      
      // Marcar mensajes como leídos (en segundo plano)
      if (unreadMessages.length > 0 && !isBlocked && !hasBlockedMe) {
        // Ejecutar en segundo plano sin afectar la experiencia del usuario
        setTimeout(() => {
          const batch = writeBatch(db);
          
          unreadMessages.forEach((msgId) => {
            batch.update(doc(db, "messages", msgId), { read: true });
          });
          
          batch.commit().catch(err => console.error("Error al marcar mensajes como leídos:", err));
        }, 500);
      }
      
      // Scroll al final en el mensaje inicial o si es nuestro último mensaje
      if (filtered.length > 0) {
        const lastMessage = filtered[filtered.length - 1];
        if (filtered.length === 1 || lastMessage.from === userData.username) {
          scrollToBottom();
        }
      }
    });

    return () => {
      unsub();
    };
  }, [userData, username, isBlocked, hasBlockedMe]);

  // Manejar el scroll del contenedor de mensajes
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // Mostrar botón de scroll si no estamos cerca del final
      setShowScrollToBottom(distanceFromBottom > 100);
      
      // Si llegamos al final, resetear contador de mensajes nuevos
      if (distanceFromBottom < 50) {
        setNewMessageCount(0);
      }
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Verificar si el usuario está al final del chat
  const isUserAtBottom = () => {
    if (!messagesContainerRef.current) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // Scroll al final de los mensajes
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
      setNewMessageCount(0);
    });
  };

  // Enviar mensaje
  const sendMessage = async () => {
    if (text.trim() === '') return;
    if (isBlocked || hasBlockedMe) {
      toast.error("No puedes enviar mensajes a este usuario");
      return;
    }

    try {
      await addDoc(collection(db, "messages"), {
        from: userData.username,
        to: username,
        text: text.trim(),
        timestamp: serverTimestamp(),
        participants: [userData.username, username],
        read: false,
        replyTo: replyTo ? { from: replyTo.from, text: replyTo.text } : null
      });

      setText('');
      setReplyTo(null);
      scrollToBottom();
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      toast.error("Error al enviar mensaje");
    }
  };

  // Manejar envío con Enter
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Cambiar entre móvil y escritorio para info de usuario
  const toggleUserInfo = () => {
    setShowUserInfo(!showUserInfo);
    setShowMobileMenu(false);
  };

  // Navegar atrás
  const goBack = () => {
    navigate("/chat");
  };

  // Determinar si hay algún tipo de bloqueo activo
  const isAnyBlockActive = isBlocked || hasBlockedMe;

  // Manejar cambios en el estado de bloqueo
  const handleBlockStatusChange = (newStatus) => {
    setIsBlocked(newStatus);
    
    // Si acabamos de bloquear al usuario, cerrar panel de info
    if (newStatus) {
      setShowUserInfo(false);
    }
  };

  // Formatear tiempo absoluto
  const formatAbsoluteTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Formatear última vez visto
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return "Desconectado";
    
    const now = new Date();
    const lastSeenDate = timestamp.toDate();
    const diffInMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Ahora";
    if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
    
    // Si es más de un día, mostrar la fecha
    return lastSeenDate.toLocaleDateString();
  };

  // Agrupar mensajes por fecha
  const groupedMessages = messages.reduce((groups, message) => {
    if (!message.timestamp) return groups;
    
    const date = message.timestamp.toDate().toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100 w-full overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-800 to-gray-900 px-2 sm:px-4 py-3 shadow-md flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <button 
            onClick={goBack}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-colors"
            aria-label="Go back"
          >
            <MdArrowBack size={24} />
          </button>
          
          <button 
            className="flex items-center space-x-2"
            onClick={toggleUserInfo}
            data-user-info-toggle
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                {receiverData?.photoURL ? (
                  <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-300">😶</div>
                )}
              </div>
              {isUserOnline && !isAnyBlockActive ? (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></div>
              ) : (
                isAnyBlockActive ? (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-800"></div>
                ) : (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-gray-500 rounded-full border-2 border-gray-800"></div>
                )
              )}
            </div>
            
            <div className="text-left">
              <div className="flex items-center">
                <h2 className="font-medium text-gray-100 truncate max-w-[120px] sm:max-w-[140px] md:max-w-full">
                  {username}
                </h2>
                <Staff username={username} />
                {isBlocked && (
                  <span className="ml-2 text-xs bg-red-500 text-white px-1 py-0.5 rounded">Bloqueado</span>
                )}
                {hasBlockedMe && (
                  <span className="ml-2 text-xs bg-gray-500 text-white px-1 py-0.5 rounded">Te bloqueó</span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {isAnyBlockActive ? (
                  "Bloqueado"
                ) : (
                  isUserOnline ? (
                    "En línea"
                  ) : (
                    lastSeen ? `Última vez: ${formatLastSeen(lastSeen)}` : "Desconectado"
                  )
                )}
              </p>
            </div>
          </button>
        </div>
        
        <div className="flex items-center space-x-1">
          {/* Acciones de escritorio */}
          <div className="hidden sm:flex items-center space-x-1">
            <button 
              className={`text-gray-400 p-2 rounded-full ${isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : 'hover:text-white hover:bg-gray-700'}`}
              aria-label="Call"
              disabled={isAnyBlockActive}
              title="Llamar"
            >
              <MdCall size={20} />
            </button>
            <button 
              className={`text-gray-400 p-2 rounded-full ${isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : 'hover:text-white hover:bg-gray-700'}`}
              aria-label="Video call"
              disabled={isAnyBlockActive}
              title="Videollamada"
            >
              <MdVideocam size={20} />
            </button>
            <button 
              onClick={toggleMuteStatus}
              className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700"
              title={isMuted ? "Activar notificaciones" : "Silenciar notificaciones"}
            >
              {isMuted ? (
                <HiSpeakerXMark size={20} />
              ) : (
                <HiSpeakerWave size={20} />
              )}
            </button>
            <button 
              onClick={toggleUserInfo}
              className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700"
              aria-label="User info"
              data-user-info-toggle
            >
              <MdInfoOutline size={20} />
            </button>
          </div>
          
          {/* Botón de menú en móvil */}
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="sm:hidden text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 relative"
            ref={menuRef}
          >
            <MdMoreVert size={20} />
          </button>
          
          {/* Menú desplegable en móvil */}
          {showMobileMenu && (
            <div className="absolute top-14 right-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-40 w-48 overflow-hidden animate-fade-in-down">
              <div className="py-1">
                <button
                  onClick={() => {
                    toggleUserInfo();
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  <MdInfoOutline size={18} className="mr-2" />
                  Ver perfil
                </button>
                <button
                  onClick={() => {
                    toggleMuteStatus();
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  {isMuted ? (
                    <>
                      <HiSpeakerWave size={18} className="mr-2" />
                      Activar notificaciones
                    </>
                  ) : (
                    <>
                      <HiSpeakerXMark size={18} className="mr-2" />
                      Silenciar notificaciones
                    </>
                  )}
                </button>
                <button
                  disabled={isAnyBlockActive}
                  className={`w-full flex items-center px-4 py-2 text-sm ${
                    isAnyBlockActive ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <MdCall size={18} className="mr-2" />
                  Llamar
                </button>
                <button
                  disabled={isAnyBlockActive}
                  className={`w-full flex items-center px-4 py-2 text-sm ${
                    isAnyBlockActive ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <MdVideocam size={18} className="mr-2" />
                  Videollamada
                </button>
                <div className="border-t border-gray-700 mt-1 pt-1">
                  <BlockUser 
                    username={username} 
                    onBlockStatusChange={handleBlockStatusChange}
                    isMobileMenu={true}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Chat Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main chat content */}
        <div className="flex-1 flex flex-col">
          {/* Mensaje de bloqueo */}
          {isAnyBlockActive && (
            <div className="bg-red-900 bg-opacity-75 p-4 text-white text-center">
              {isBlocked ? (
                <div className="flex items-center justify-center space-x-2">
                  <MdBlock size={20} />
                  <span>Has bloqueado a este usuario. No puedes enviar ni recibir mensajes.</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <MdBlock size={20} />
                  <span>Este usuario te ha bloqueado. No puedes enviar mensajes.</span>
                </div>
              )}
            </div>
          )}

          {/* Área de chat */}
          <div 
            className="flex-1 overflow-y-auto bg-gray-900 px-1 sm:px-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
            ref={messagesContainerRef}
          >
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <div className="bg-gray-800 p-6 rounded-full mb-4">
                  <MdChat className="text-indigo-400" size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-300 mb-2">No hay mensajes aún</h3>
                <p className="text-gray-500 max-w-md">
                  Comienza una conversación con {username}. ¡Di hola!
                </p>
              </div>
            ) : (
              // Mensajes agrupados por fecha
              Object.entries(groupedMessages).map(([date, dateMessages]) => (
                <div key={date} className="mb-4">
                  <div className="flex justify-center my-3">
                    <div className="bg-gray-800 text-gray-400 text-xs font-medium px-3 py-1 rounded-full">
                      {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                  
                  {/* Mensajes del día */}
                  <div className="space-y-2">
                    {dateMessages.map((message, index) => {
                      const isMine = message.from === userData.username;
                      const isFirstInChain = index === 0 || dateMessages[index - 1].from !== message.from;
                      const isLastInChain = index === dateMessages.length - 1 || dateMessages[index + 1].from !== message.from;
                      
                      return (
                        <div
                          key={message.id || index}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'} relative group`}
                        >
                          {/* Avatar (solo para el primer mensaje de una cadena) */}
                          {!isMine && isFirstInChain && (
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0 mt-1 mr-1">
                              {receiverData?.photoURL ? (
                                <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-gray-300">😶</div>
                              )}
                            </div>
                          )}
                          
                          {/* Espacio cuando no hay avatar */}
                          {!isMine && !isFirstInChain && <div className="w-9 flex-shrink-0"></div>}
                          
                          <div className={`max-w-[75%] sm:max-w-[65%] px-3 py-2 rounded-lg relative ${
                            isMine 
                              ? "bg-indigo-600 text-white " + 
                                (isFirstInChain ? "rounded-tr-none" : "") + 
                                (isLastInChain ? " rounded-br-none" : "")
                              : "bg-gray-800 text-gray-100 " + 
                                (isFirstInChain ? "rounded-tl-none" : "") + 
                                (isLastInChain ? " rounded-bl-none" : "")
                          }`}>
                            {/* Mensaje citado */}
                            {message.replyTo && (
                              <div className={`text-xs border-l-2 pl-2 mb-2 opacity-75 rounded py-1 bg-black bg-opacity-20 ${
                                isMine ? "border-indigo-400" : "border-gray-500"
                              }`}>
                                <span className="font-medium">{message.replyTo.from}</span>
                                <Staff username={message.replyTo.from} className="w-3 h-3" />
                                <span>: "{message.replyTo.text}"</span>
                              </div>
                            )}
                            
                            {/* Contenido del mensaje */}
                            <p className="break-words whitespace-pre-wrap">
                              {message.text}
                            </p>
                            
                            {/* Hora y estado de leído */}
                            <div className="flex items-center justify-end mt-1 space-x-1">
                              <span className={`text-[10px] ${isMine ? "text-indigo-200 opacity-70" : "text-gray-400 opacity-70"}`}>
                                {message.timestamp?.toDate ? formatAbsoluteTime(message.timestamp) : "..."}
                              </span>
                              {isMine && message.read && (
                                <HiCheck size={12} className="text-green-400" />
                              )}
                            </div>
                            
                            {/* Acciones en hover */}
                            <div className="absolute top-1 right-0 opacity-0 group-hover:opacity-100 transition-opacity -mr-8 flex flex-col gap-1">
                              <button
                                onClick={() => !isAnyBlockActive && setReplyTo({ from: message.from, text: message.text })}
                                className={`p-1 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 ${isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={isAnyBlockActive}
                                title="Responder"
                              >
                                <MdChat size={14} />
                              </button>
                              {isMine && (
                                <button
                                  onClick={async () => {
                                    if (window.confirm("¿Eliminar este mensaje?")) {
                                      try {
                                        await deleteDoc(doc(db, "messages", message.id));
                                      } catch (error) {
                                        console.error("Error al eliminar mensaje:", error);
                                        toast.error("No se pudo eliminar el mensaje");
                                      }
                                    }
                                  }}
                                  className="p-1 rounded-full bg-red-800 text-red-200 hover:bg-red-700"
                                  title="Eliminar mensaje"
                                >
                                  <MdDelete size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Avatar propio (solo para primer mensaje de una cadena) */}
                          {isMine && isFirstInChain && (
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0 mt-1 ml-1">
                              {userData?.photoURL ? (
                                <img src={userData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-gray-300">😶</div>
                              )}
                            </div>
                          )}
                          
                          {/* Espacio cuando no hay avatar */}
                          {isMine && !isFirstInChain && <div className="w-9 flex-shrink-0"></div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} className="h-4"></div>
          </div>

          {/* Botón de scroll al final */}
          {showScrollToBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-20 right-4 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full shadow-lg flex items-center justify-center transition-all z-10"
            >
              <MdKeyboardArrowDown size={24} />
              {newMessageCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-xs text-white rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
                  {newMessageCount}
                </span>
              )}
            </button>
          )}

          {/* Área de respuesta */}
          {replyTo && !isAnyBlockActive && (
            <ReplyPreview replyTo={replyTo} onCancel={() => setReplyTo(null)} />
          )}

          {/* Input de mensaje */}
          {isAnyBlockActive ? (
            <div className="border-t border-gray-800 px-3 py-4 bg-gray-900">
              <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-center">
                <MdBlock className="text-red-500 mr-2" size={20} />
                <span className="text-gray-400">
                  {isBlocked ? "Has bloqueado a este usuario" : "Este usuario te ha bloqueado"}
                </span>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-800 bg-gray-900 p-3">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="text-gray-400 hover:text-gray-200 p-2 rounded-full hover:bg-gray-800 relative"
                  >
                    <MdAdd size={24} />
                    
                    {/* Menú de adjuntos */}
                    {showAttachMenu && (
                      <div className="absolute bottom-12 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 w-40 py-1 animate-fade-in-down">
                        <button
                          className="flex items-center w-full px-3 py-2 text-gray-300 hover:bg-gray-700 text-sm"
                        >
                          <MdImage className="mr-2" size={18} />
                          Imagen
                        </button>
                        <button
                          className="flex items-center w-full px-3 py-2 text-gray-300 hover:bg-gray-700 text-sm"
                        >
                          <span role="img" aria-label="GIF" className="mr-2 text-base">🎞️</span>
                          GIF
                        </button>
                      </div>
                    )}
                  </button>
                </div>
                
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-gray-800 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px] max-h-24 resize-none"
                  rows={1}
                />
                
                <button
                  onClick={sendMessage}
                  disabled={!text.trim()}
                  className={`p-2 rounded-full ${
                    !text.trim()
                      ? "bg-gray-800 text-gray-500 cursor-not-allowed" 
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
                >
                  <MdSend size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* User info sidebar (desktop) */}
        {showUserInfo && (
          <div className="hidden md:block w-80 bg-gray-800 border-l border-gray-700 animate-slide-in-right overflow-y-auto" ref={userInfoRef}>
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Información de usuario</h3>
                <button 
                  onClick={() => setShowUserInfo(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"
                >
                  <MdClose size={20} />
                </button>
              </div>
              
              {receiverData ? (
                <div className="space-y-4">
                  {/* Perfil */}
                  <div className="flex flex-col items-center bg-gray-750 p-4 rounded-lg border border-gray-700">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-700 mb-3">
                      {receiverData.photoURL ? (
                        <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">😶</div>
                      )}
                    </div>
                    <div className="flex items-center">
                      <h4 className="text-xl font-bold text-white truncate max-w-full">
                        {username}
                      </h4>
                      <Staff username={username} />
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      {isAnyBlockActive ? "Bloqueado" : (isUserOnline ? "En línea" : "Desconectado")}
                    </p>
                    
                    {/* Insignias o información adicional */}
                    <div className="flex gap-2 mt-2">
                      <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                        Usuario desde {receiverData.joinDate ? new Date(receiverData.joinDate.toDate()).toLocaleDateString() : "..."}
                      </span>
                    </div>
                  </div>
                  
                  {/* Información de contacto */}
                  <div className="bg-gray-750 p-4 rounded-lg border border-gray-700 space-y-3">
                    <h5 className="font-medium text-gray-200 mb-2">Información de contacto</h5>
                    
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Correo</label>
                      <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                        {receiverData.email || "No disponible"}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Estado</label>
                      <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                        {receiverData.status || "Sin estado"}
                      </div>
                    </div>
                  </div>
                  
                  {/* Acciones */}
                  <div className="space-y-2">
                    <button 
                      onClick={toggleMuteStatus}
                      className="w-full py-2 bg-gray-750 hover:bg-gray-700 rounded text-gray-300 transition-colors flex items-center justify-center space-x-2"
                    >
                      {isMuted ? (
                        <>
                          <HiSpeakerWave size={18} />
                          <span>Activar notificaciones</span>
                        </>
                      ) : (
                        <>
                          <HiSpeakerXMark size={18} />
                          <span>Silenciar notificaciones</span>
                        </>
                      )}
                    </button>
                    
                    <BlockUser 
                      username={username} 
                      onBlockStatusChange={handleBlockStatusChange} 
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* User info modal (mobile) */}
        {showUserInfo && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-50 flex justify-end animate-fade-in-down" onClick={() => setShowUserInfo(false)}>
            <div className="w-[85%] max-w-xs bg-gray-800 h-full animate-slide-in-right overflow-y-auto" ref={userInfoRef} onClick={(e) => e.stopPropagation()}>
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white">Información de usuario</h3>
                  <button 
                    onClick={() => setShowUserInfo(false)}
                    className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700"
                  >
                    <MdClose size={20} />
                  </button>
                </div>
                
                {receiverData ? (
                  <div className="space-y-4">
                    {/* Perfil */}
                    <div className="flex flex-col items-center bg-gray-750 p-4 rounded-lg border border-gray-700">
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-700 mb-3">
                        {receiverData.photoURL ? (
                          <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">😶</div>
                        )}
                      </div>
                      <div className="flex items-center">
                        <h4 className="text-xl font-bold text-white truncate max-w-full">
                          {username}
                        </h4>
                        <Staff username={username} />
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {isAnyBlockActive ? "Bloqueado" : (isUserOnline ? "En línea" : "Desconectado")}
                      </p>
                      
                      {/* Insignias o información adicional */}
                      <div className="flex gap-2 mt-2">
                        <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                          Usuario desde {receiverData.joinDate ? new Date(receiverData.joinDate.toDate()).toLocaleDateString() : "..."}
                        </span>
                      </div>
                    </div>
                    
                    {/* Información de contacto */}
                    <div className="bg-gray-750 p-4 rounded-lg border border-gray-700 space-y-3">
                      <h5 className="font-medium text-gray-200 mb-2">Información de contacto</h5>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Correo</label>
                        <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                          {receiverData.email || "No disponible"}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Estado</label>
                        <div className="bg-gray-700 p-2 rounded text-gray-300 text-sm">
                          {receiverData.status || "Sin estado"}
                        </div>
                      </div>
                    </div>
                    
                    {/* Acciones */}
                    <div className="space-y-2">
                      <button 
                        onClick={toggleMuteStatus}
                        className="w-full py-2 bg-gray-750 hover:bg-gray-700 rounded text-gray-300 transition-colors flex items-center justify-center space-x-2"
                      >
                        {isMuted ? (
                          <>
                            <HiSpeakerWave size={18} />
                            <span>Activar notificaciones</span>
                          </>
                        ) : (
                          <>
                            <HiSpeakerXMark size={18} />
                            <span>Silenciar notificaciones</span>
                          </>
                        )}
                      </button>
                      
                      <BlockUser 
                        username={username} 
                        onBlockStatusChange={handleBlockStatusChange} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}