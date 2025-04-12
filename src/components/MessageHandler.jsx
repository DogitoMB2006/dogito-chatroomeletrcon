import { useEffect, useState, useContext, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import { db, storage } from "../firebase/config";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  writeBatch,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  addDoc
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage";
import { format } from "date-fns";
import { MdDelete, MdReply, MdBlock, MdKeyboardArrowDown } from "react-icons/md";
import { toast } from "react-toastify";

// Componentes
import Staff from "../components/Staff";

// Importar componentes de mensajes
import {
  MessageInput,
  ReplyPreview,
  BlockedBanner,
  ImagePreview,
  BlockedMessageInput,
  CantSendMessage
} from "../components/messages";

export default function MessageHandler({ receiver, isBlocked }) {
  const { userData } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [receiverData, setReceiverData] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [showCantSendMessage, setShowCantSendMessage] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [image, setImage] = useState(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [text, setText] = useState("");
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastMessageCountRef = useRef(0);
  const navigate = useNavigate();

  // Obtener datos del receptor
  useEffect(() => {
    const getReceiverData = async () => {
      try {
        const q = query(collection(db, "users"), where("username", "==", receiver));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setReceiverData(snap.docs[0].data());
        }
      } catch (error) {
        console.error("Error al obtener datos del receptor:", error);
      }
    };
    getReceiverData();
  }, [receiver]);

  // Listener para mensajes
  useEffect(() => {
    if (!userData) return;

    const messagesRef = collection(db, "messages");
    const q = query(
      messagesRef,
      where("participants", "array-contains", userData.username),
      orderBy("timestamp", "asc")
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      if (!isMountedRef.current) return;
      
      const filtered = [];
      const unreadMessages = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        const isBetween =
          (data.from === userData.username && data.to === receiver) ||
          (data.from === receiver && data.to === userData.username);

        if (isBetween) {
          if (data.to === userData.username && !data.read && !isBlocked) {
            unreadMessages.push(docSnap.id);
          }

          filtered.push({ ...data, id: docSnap.id });
        }
      }

      setMessages(filtered);
      
      // Verificar si hay nuevos mensajes para mostrar contador
      if (filtered.length > lastMessageCountRef.current) {
        const newMessages = filtered.slice(lastMessageCountRef.current);
        const incomingMessages = newMessages.filter(msg => msg.from === receiver);
        
        if (incomingMessages.length > 0 && !isUserAtBottom()) {
          setNewMessageCount(prev => prev + incomingMessages.length);
        }
      }
      
      // Actualizar referencia de contador
      lastMessageCountRef.current = filtered.length;
      
      // Marcar mensajes como leídos (en segundo plano), pero solo si no hay bloqueo
      if (unreadMessages.length > 0 && !isBlocked) {
        // Ejecutar en segundo plano sin afectar la experiencia del usuario
        setTimeout(() => {
          if (!isMountedRef.current) return;
          
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
      isMountedRef.current = false;
    };
  }, [userData, receiver, isBlocked]);

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
  const handleSend = async () => {
    if (text.trim() === '' && !image) return;
    if (isBlocked) {
      toast.error("No puedes enviar mensajes a este usuario");
      return;
    }

    try {
      let imageUrl = null;

      if (image) {
        const imageRef = ref(storage, `chatImages/${Date.now()}-${image.name}`);
        await uploadBytes(imageRef, image);
        imageUrl = await getDownloadURL(imageRef);
      }

      await addDoc(collection(db, "messages"), {
        from: userData.username,
        to: receiver,
        text: text.trim(),
        image: imageUrl,
        timestamp: serverTimestamp(),
        participants: [userData.username, receiver],
        read: false,
        replyTo: replyTo ? { from: replyTo.from, text: replyTo.text } : null
      });

      setText('');
      setImage(null);
      setReplyTo(null);
      scrollToBottom();
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      toast.error("Error al enviar mensaje");
    }
  };

  // Manejar el click en imagen para adjuntar
  const handleImageClick = () => {
    fileInputRef.current.click();
  };

  // Manejar cambio de archivo
  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  // Manejar envío con Enter
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Manejar eliminación de mensaje
  const handleDeleteMessage = async (msgId, imageUrl) => {
    if (!window.confirm("¿Estás seguro de eliminar este mensaje?")) return;
    
    try {
      // Si el mensaje tiene una imagen, eliminarla del storage
      if (imageUrl) {
        try {
          const imagePath = decodeURIComponent(new URL(imageUrl).pathname.split("/o/")[1]);
          const imageRef = ref(storage, imagePath);
          await deleteObject(imageRef);
        } catch (error) {
          console.error("Error al eliminar imagen:", error);
          // Continuamos con la eliminación del mensaje incluso si falla la eliminación de la imagen
        }
      }
      
      // Eliminar el mensaje
      await deleteDoc(doc(db, "messages", msgId));
      toast.success("Mensaje eliminado");
    } catch (error) {
      console.error("Error al eliminar mensaje:", error);
      toast.error("Error al eliminar mensaje");
    }
  };

  // Manejar click en GIF
  const handleGifClick = async (gifUrl) => {
    if (isBlocked) {
      toast.error("No puedes enviar mensajes a este usuario");
      return;
    }

    try {
      await addDoc(collection(db, "messages"), {
        from: userData.username,
        to: receiver,
        text: "",
        image: gifUrl, // Usamos la URL del GIF como imagen
        timestamp: serverTimestamp(),
        participants: [userData.username, receiver],
        read: false,
        replyTo: replyTo ? { from: replyTo.from, text: replyTo.text } : null
      });

      setReplyTo(null);
      scrollToBottom();
    } catch (error) {
      console.error("Error al enviar GIF:", error);
      toast.error("Error al enviar GIF");
    }
  };

  // Mensaje cuando no se puede enviar
  const handleCantSendMessage = () => {
    setShowCantSendMessage(true);
    setTimeout(() => setShowCantSendMessage(false), 3000);
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

  // Formatear tiempo absoluto
  const formatTime = (timestamp) => {
    if (!timestamp?.toDate) return "";
    return format(timestamp.toDate(), 'p'); // Format: 10:15 AM
  };

  return (
    <div className="flex flex-col h-full">
      {/* Notificación de bloqueo */}
      {isBlocked && (
        <BlockedBanner 
          iHaveBlocked={true} 
          hasBlockedMe={false} 
        />
      )}

      {/* Overlay de imagen previa */}
      {previewImage && (
        <ImagePreview 
          imageUrl={previewImage} 
          onClose={() => setPreviewImage(null)} 
        />
      )}

      {/* Mensaje de error de envío */}
      {showCantSendMessage && (
        <CantSendMessage />
      )}

      {/* Área de mensajes */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
        ref={messagesContainerRef}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-gray-800 p-6 rounded-full mb-4">
              <div className="text-indigo-400 text-2xl">💬</div>
            </div>
            <h3 className="text-xl font-bold text-gray-300 mb-2">No hay mensajes aún</h3>
            <p className="text-gray-500 max-w-md">
              Comienza una conversación con {receiver}. ¡Di hola!
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
                  const photoURL = isMine ? userData?.photoURL : receiverData?.photoURL;
                  
                  return (
                    <div
                      key={message.id || index}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'} relative group`}
                    >
                      {/* Avatar (solo para el primer mensaje de una cadena) */}
                      {!isMine && isFirstInChain && (
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0 mt-1 mr-1">
                          {photoURL ? (
                            <img src={photoURL} alt="avatar" className="w-full h-full object-cover" />
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
                        
                        {/* Imagen del mensaje */}
                        {message.image && (
                          <div className="mb-2">
                            <img
                              src={message.image}
                              alt="media"
                              className="rounded max-w-full max-h-60 cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setPreviewImage(message.image)}
                            />
                          </div>
                        )}
                        
                        {/* Texto del mensaje */}
                        {message.text && (
                          <p className="break-words whitespace-pre-wrap">
                            {message.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                              part.match(/^https?:\/\/[^\s]+$/) ? (
                                <a
                                  key={i}
                                  href={part}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`underline ${isMine ? 'text-blue-200' : 'text-blue-300'} break-all`}
                                >
                                  {part}
                                </a>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </p>
                        )}
                        
                        {/* Hora del mensaje */}
                        <span className={`block text-[10px] mt-1 text-right opacity-70 ${
                          isMine ? "text-indigo-200" : "text-gray-400"
                        }`}>
                          {formatTime(message.timestamp)}
                        </span>
                        
                        {/* Acciones en hover */}
                        <div className="absolute top-1 right-0 opacity-0 group-hover:opacity-100 transition-opacity -mr-8 flex flex-col gap-1">
                          <button
                            onClick={() => !isBlocked && setReplyTo({ from: message.from, text: message.text || (message.image ? "[Imagen]" : "") })}
                            className={`p-1 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 ${isBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isBlocked}
                            title="Responder"
                          >
                            <MdReply size={14} />
                          </button>
                          {isMine && (
                            <button
                              onClick={() => handleDeleteMessage(message.id, message.image)}
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
                          {photoURL ? (
                            <img src={photoURL} alt="avatar" className="w-full h-full object-cover" />
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
      {replyTo && !isBlocked && (
        <ReplyPreview replyTo={replyTo} onCancel={() => setReplyTo(null)} />
      )}

      {/* Input de mensaje */}
      {isBlocked ? (
        <BlockedMessageInput 
          iHaveBlocked={true} 
          hasBlockedMe={false} 
        />
      ) : (
        <MessageInput 
          receiver={receiver}
          userData={userData}
          text={text}
          setText={setText}
          image={image}
          setImage={setImage}
          handleSend={handleSend}
          replyTo={replyTo}
          setReplyTo={setReplyTo}
          handleImageClick={handleImageClick}
          handleFileChange={handleFileChange}
          fileInputRef={fileInputRef}
          onCantSendMessage={handleCantSendMessage}
          handleKeyDown={handleKeyDown}
          scrollToBottom={scrollToBottom}
          handleGifClick={handleGifClick}
        />
      )}
    </div>
  );
}