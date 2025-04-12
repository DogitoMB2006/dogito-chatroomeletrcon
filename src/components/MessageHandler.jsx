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
  addDoc,
  limit
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
  const [isUserAtBottomState, setIsUserAtBottomState] = useState(true);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastMessageCountRef = useRef(0);
  const navigate = useNavigate();
  const previousMessagesLengthRef = useRef(0);

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

    // Limpieza al desmontar
    return () => {
      isMountedRef.current = false;
    };
  }, [receiver]);

  // Listener para mensajes - OPTIMIZADO Y CORREGIDO
  useEffect(() => {
    if (!userData || !receiver) return;

    // Crear consulta que incluya ambas direcciones de mensajes
    const q1 = query(
      collection(db, "messages"),
      where("from", "==", userData.username),
      where("to", "==", receiver),
      orderBy("timestamp", "asc")
    );

    const q2 = query(
      collection(db, "messages"),
      where("from", "==", receiver),
      where("to", "==", userData.username),
      orderBy("timestamp", "asc")
    );

    // Combinar los resultados de ambas consultas
    const unsubscribe1 = onSnapshot(q1, (snapshot1) => {
      if (!isMountedRef.current) return;
      
      // Establecer mensajes del primer query
      const messagesFromUser = snapshot1.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      
      // Obtener mensajes al receptor para combinarlos
      const unsubscribe2 = onSnapshot(q2, (snapshot2) => {
        if (!isMountedRef.current) return;
        
        const messagesToUser = snapshot2.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        }));
        
        // Combinar y ordenar todos los mensajes por timestamp
        const allMessages = [...messagesFromUser, ...messagesToUser].sort((a, b) => {
          // Manejar mensajes sin timestamp (posiblemente en progreso de envío)
          if (!a.timestamp && !b.timestamp) return 0;
          if (!a.timestamp) return 1;  // Poner mensajes sin timestamp al final
          if (!b.timestamp) return -1;
          
          return a.timestamp.seconds - b.timestamp.seconds;
        });
        
        // Actualizar el estado con todos los mensajes
        setMessages(allMessages);
        
        // Si hay nuevos mensajes y son del receptor, incrementar contador si no estamos al final
        if (allMessages.length > previousMessagesLengthRef.current) {
          const newMessages = allMessages.slice(previousMessagesLengthRef.current);
          const incomingMessages = newMessages.filter(msg => msg.from === receiver);
          
          if (incomingMessages.length > 0 && !isUserAtBottom()) {
            setNewMessageCount(prev => prev + incomingMessages.length);
          } else if (
            allMessages.length > 0 && 
            allMessages[allMessages.length - 1].from === userData.username
          ) {
            // Si el último mensaje es nuestro, scroll al final
            scrollToBottom();
          }
        }
        
        // Actualizar la referencia para la próxima comparación
        previousMessagesLengthRef.current = allMessages.length;
        
        // Marcar mensajes como leídos (en segundo plano)
        if (!isBlocked) {
          const unreadMessages = messagesToUser.filter(msg => !msg.read);
          if (unreadMessages.length > 0) {
            markMessagesAsRead(unreadMessages);
          }
        }
      });
      
      // Limpiar el segundo listener cuando se desmonte el componente
      return () => unsubscribe2();
    });

    // Función para marcar mensajes como leídos en batch
    const markMessagesAsRead = async (messagesToMark) => {
      try {
        const batch = writeBatch(db);
        messagesToMark.forEach(msg => {
          batch.update(doc(db, "messages", msg.id), { read: true });
        });
        await batch.commit();
      } catch (error) {
        console.error("Error al marcar mensajes como leídos:", error);
      }
    };

    return () => {
      unsubscribe1();
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
      
      // Actualizar si el usuario está al final
      setIsUserAtBottomState(distanceFromBottom < 50);
      
      // Si llegamos al final, resetear contador de mensajes nuevos
      if (distanceFromBottom < 50) {
        setNewMessageCount(0);
      }
    };
    
    container.addEventListener('scroll', handleScroll);
    
    // Hacer scroll al final al montar el componente
    scrollToBottom();
    
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Hacer scroll al final cuando cambie la lista de mensajes
  useEffect(() => {
    // Scroll al final solo si estamos en el fondo o si el último mensaje es nuestro
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (
        isUserAtBottomState || 
        (lastMessage && lastMessage.from === userData?.username)
      ) {
        scrollToBottom();
      }
    }
  }, [messages, isUserAtBottomState, userData?.username]);

  // Verificar si el usuario está al final del chat
  const isUserAtBottom = () => {
    if (!messagesContainerRef.current) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 50;
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

  // Enviar mensaje - MEJORADO
  const handleSend = async () => {
    if (text.trim() === '' && !image) return;
    if (isBlocked) {
      toast.error("No puedes enviar mensajes a este usuario");
      return;
    }

    try {
      let imageUrl = null;

      if (image) {
        const storageFileName = `${Date.now()}-${image.name}`;
        const imageRef = ref(storage, `chatImages/${storageFileName}`);
        await uploadBytes(imageRef, image);
        imageUrl = await getDownloadURL(imageRef);
      }

      // Crear el documento del mensaje en Firestore
      const messageData = {
        from: userData.username,
        to: receiver,
        text: text.trim(),
        image: imageUrl,
        timestamp: serverTimestamp(),
        participants: [userData.username, receiver],
        read: false,
        replyTo: replyTo ? { from: replyTo.from, text: replyTo.text } : null
      };

      await addDoc(collection(db, "messages"), messageData);

      // Limpiar estado después de enviar
      setText('');
      setImage(null);
      setReplyTo(null);
      
      // Forzar scroll al final
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
          // Verificar si es una URL de GIF externa o una imagen almacenada
          const isExternalGif = imageUrl.includes("tenor.com") || 
                              imageUrl.includes("giphy.com") || 
                              !imageUrl.includes("firebasestorage");
          
          if (!isExternalGif) {
            const imagePath = decodeURIComponent(new URL(imageUrl).pathname.split("/o/")[1]);
            const imageRef = ref(storage, imagePath);
            await deleteObject(imageRef);
          }
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
      // Crear mensaje directamente con la URL del GIF
      const messageData = {
        from: userData.username,
        to: receiver,
        text: "",
        image: gifUrl,
        timestamp: serverTimestamp(),
        participants: [userData.username, receiver],
        read: false,
        replyTo: replyTo ? { from: replyTo.from, text: replyTo.text } : null
      };

      await addDoc(collection(db, "messages"), messageData);
      
      // Limpiar estado de respuesta si hay alguna
      setReplyTo(null);
      
      // Forzar scroll al final
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
    // Usar fecha actual para mensajes sin timestamp (posiblemente en progreso de envío)
    const messageDate = message.timestamp ? message.timestamp.toDate() : new Date();
    const date = messageDate.toLocaleDateString();
    
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
                  const isMine = message.from === userData?.username;
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
                          {message.timestamp ? formatTime(message.timestamp) : "enviando..."}
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