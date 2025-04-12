import { useParams, useNavigate } from "react-router-dom";
import { useContext, useState, useEffect } from "react";
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
import { MdArrowBack, MdMoreVert, MdCall, MdVideocam, MdClose, MdBlock } from "react-icons/md";
import { listenToUserStatus } from "../utils/onlineStatus";

export default function PrivateChat() {
  const { username } = useParams();
  const { userData } = useContext(AuthContext);
  const navigate = useNavigate();
  const [receiverData, setReceiverData] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [isUserOnline, setIsUserOnline] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);

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

  // Fetch receiver's data
  useEffect(() => {
    const fetchReceiverData = async () => {
      const q = query(collection(db, "users"), where("username", "==", username));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setReceiverData(snapshot.docs[0].data());
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
      const batch = [];
      for (const docSnap of snapshot.docs) {
        batch.push(updateDoc(doc(db, "messages", docSnap.id), { read: true }));
      }
      
      if (batch.length > 0) {
        await Promise.all(batch);
        console.log(`Marcados ${batch.length} mensajes como leídos`);
      }});

      return () => unsubscribe();
    }, [userData, username, isBlocked]);
  
    const goBack = () => {
      navigate("/chat");
    };
  
    const toggleUserInfo = () => {
      setShowUserInfo(!showUserInfo);
    };
  
    // Manejar cambios en el estado de bloqueo
    const handleBlockStatusChange = (newStatus) => {
      setIsBlocked(newStatus);
      
      // Si acabamos de bloquear al usuario, forzar una actualización de la interfaz
      if (newStatus) {
        console.log("Usuario bloqueado, actualizando interfaz...");
      }
    };

    // Determinar si hay algún tipo de bloqueo activo
    const isAnyBlockActive = isBlocked || hasBlockedMe;
  
    return (
      <div className="h-screen flex flex-col bg-gray-900 text-gray-100 w-full overflow-hidden">
        {/* Header */}
        <header className="bg-gray-800 px-4 py-4 sm:px-6 sm:py-3 shadow-md flex items-center justify-between">
  <div className="flex items-center gap-3">
    <button 
      onClick={goBack}
      className="text-white p-2 rounded-full hover:bg-gray-700"
      aria-label="Go back"
    >
      <MdArrowBack size={28} />
    </button>

    <div className="flex items-center gap-3">
      <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-600">
        {receiverData?.photoURL ? (
          <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-base text-gray-300">😶</div>
        )}
        {isUserOnline && !isAnyBlockActive && (
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-gray-800 rounded-full"></span>
        )}
        {isAnyBlockActive && (
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-gray-800 rounded-full"></span>
        )}
      </div>

      <div>
        <h2 className="font-semibold text-base sm:text-lg text-white max-w-[180px] truncate">
          {username}
          {isBlocked && (
            <span className="ml-2 text-xs bg-red-500 text-white px-1 py-0.5 rounded">Bloqueado</span>
          )}
          {hasBlockedMe && (
            <span className="ml-2 text-xs bg-gray-500 text-white px-1 py-0.5 rounded">Te bloqueó</span>
          )}
        </h2>
        <p className="text-xs text-gray-400">{isAnyBlockActive ? "Bloqueado" : (isUserOnline ? "En línea" : "Desconectado")}</p>
      </div>
    </div>
  </div>

  <div className="flex items-center gap-2">
    <button 
      className={`text-white p-2 rounded-full ${isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'} hidden sm:block`}
      disabled={isAnyBlockActive}
    >
      <MdCall size={24} />
    </button>
    <button 
      className={`text-white p-2 rounded-full ${isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'} hidden sm:block`}
      disabled={isAnyBlockActive}
    >
      <MdVideocam size={24} />
    </button>
    <button 
      onClick={toggleUserInfo}
      className="text-white p-2 rounded-full hover:bg-gray-700"
    >
      <MdMoreVert size={24} />
    </button>
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

<div className="flex-1 overflow-y-auto bg-gray-900 px-4 pb-32 pt-2 sm:px-6 sm:pt-4 sm:pb-4">

  <div className="w-full h-full">
    <MessageHandler 
      receiver={username} 
      isBlocked={isAnyBlockActive} 
    />
  </div>
</div>


          </div>
          
          {/* Mobile User Info Overlay */}
          {showUserInfo && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 md:hidden flex justify-end">
    <div className="w-4/5 max-w-xs bg-gray-800 h-full overflow-y-auto p-4 animate-slide-in-right rounded-l-2xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-lg text-white">Información del usuario</h3>
        <button 
          onClick={toggleUserInfo}
          className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700"
        >
          <MdClose size={24} />
        </button>
      </div>

      {receiverData && (
        <div className="space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-600 mb-4">
              {receiverData.photoURL ? (
                <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">😶</div>
              )}
            </div>
            <h4 className="text-xl font-bold text-white">{username}</h4>
            <p className="text-sm text-gray-400">
              {isAnyBlockActive ? "Bloqueado" : (isUserOnline ? "En línea" : "Desconectado")}
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-gray-400 mb-1">Correo</p>
              <p className="text-white break-words">{receiverData.email || "No disponible"}</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-gray-400 mb-1">Estado</p>
              <p className="text-white">{receiverData.status || "Sin estado"}</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-gray-400 mb-1">Se unió</p>
              <p className="text-white">{receiverData.joinDate || "Fecha desconocida"}</p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700 space-y-3">
            <button 
              className={`w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white transition-colors ${
                isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={isAnyBlockActive}
            >
              Enviar mensaje
            </button>
            <BlockUser 
              username={username} 
              onBlockStatusChange={handleBlockStatusChange} 
            />
          </div>
        </div>
      )}
    </div>
  </div>
)}

          
          {/* Desktop sidebar - Only shown on desktop */}
          {showUserInfo && (
  <div className="w-72 bg-gray-800 shadow-lg border-l border-gray-700 overflow-y-auto hidden md:block p-6 animate-fade-in-down">
    <h3 className="font-semibold text-lg text-white mb-6">Información del usuario</h3>

    {receiverData && (
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-600 mb-4">
            {receiverData.photoURL ? (
              <img src={receiverData.photoURL} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">😶</div>
            )}
          </div>
          <h4 className="text-xl font-bold text-white">{username}</h4>
          <p className="text-sm text-gray-400">
            {isAnyBlockActive ? "Bloqueado" : (isUserOnline ? "En línea" : "Desconectado")}
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="bg-gray-700 p-3 rounded-lg">
            <p className="text-gray-400 mb-1">Correo</p>
            <p className="text-white break-words">{receiverData.email || "No disponible"}</p>
          </div>
          <div className="bg-gray-700 p-3 rounded-lg">
            <p className="text-gray-400 mb-1">Estado</p>
            <p className="text-white">{receiverData.status || "Sin estado"}</p>
          </div>
          <div className="bg-gray-700 p-3 rounded-lg">
            <p className="text-gray-400 mb-1">Se unió</p>
            <p className="text-white">{receiverData.joinDate || "Fecha desconocida"}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-700 space-y-3">
          <button 
            className={`w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white transition-colors ${
              isAnyBlockActive ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isAnyBlockActive}
          >
            Enviar mensaje
          </button>
          <BlockUser 
            username={username} 
            onBlockStatusChange={handleBlockStatusChange} 
          />
        </div>
      </div>
    )}
  </div>
)}

        </div>
      </div>
    );
  }