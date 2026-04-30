import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import ChatMessage from './components/ChatMessage';
import ParticipantList from './components/ParticipantList';
import LoginModal from './components/LoginModal';
import './App.css';

const SOCKET_URL = 'http://localhost:4000';

type MessageType = 'text' | 'system' | 'ai';

interface Participant {
  id: string;
  name: string;
  color?: string;
  isAI?: boolean;
  type?: string;
}

interface ChatMessageData {
  id: string;
  type: MessageType;
  content: string;
  timestamp: string | Date;
  sender: Participant | null;
}

interface ChatStatePayload {
  users: Participant[];
  messages: ChatMessageData[];
  aiBots: Participant[];
  autonomousDebate?: DebateState;
}

interface UserEventPayload {
  user: Participant;
  message: ChatMessageData;
}

interface DebateState {
  active: boolean;
  topic: string;
  rounds: number;
  startedBy: string | null;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [user, setUser] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [aiBots, setAiBots] = useState<Participant[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [debateTopic, setDebateTopic] = useState('');
  const [debateRounds, setDebateRounds] = useState(3);
  const [debateState, setDebateState] = useState<DebateState>({
    active: false,
    topic: '',
    rounds: 0,
    startedBy: null
  });
  const [showLogin, setShowLogin] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (socket) {
      socket.on('message', (message: ChatMessageData) => {
        setMessages((prev) => [...prev, message]);
      });

      socket.on('userJoined', ({ message }: UserEventPayload) => {
        setMessages((prev) => [...prev, message]);
        updateParticipants();
      });

      socket.on('userLeft', ({ message }: UserEventPayload) => {
        setMessages((prev) => [...prev, message]);
        updateParticipants();
      });

      socket.on('chatState', ({ users, messages: chatMessages, aiBots: bots, autonomousDebate }: ChatStatePayload) => {
        setParticipants(users);
        setMessages(chatMessages);
        setAiBots(bots);
        if (autonomousDebate) {
          setDebateState(autonomousDebate);
        }
      });

      socket.on('debateState', (state: DebateState) => {
        setDebateState(state);
      });

      return () => {
        socket.off('message');
        socket.off('userJoined');
        socket.off('userLeft');
        socket.off('chatState');
        socket.off('debateState');
      };
    }
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateParticipants = () => {
    if (socket) {
      socket.emit('getParticipants');
    }
  };

  const handleLogin = (name: string) => {
    const newSocket = io(SOCKET_URL);
    newSocket.on('connect', () => {
      newSocket.emit('join', { name });
      setUser({ id: newSocket.id ?? '', name });
      setShowLogin(false);
    });
    setSocket(newSocket);
  };

  const sendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inputMessage.trim() && socket) {
      socket.emit('message', { content: inputMessage.trim() });
      setInputMessage('');
    }
  };

  const startDebate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!socket || !debateTopic.trim() || debateState.active) {
      return;
    }

    socket.emit('startAutonomousDebate', {
      topic: debateTopic.trim(),
      rounds: debateRounds
    });
  };

  const getAllParticipants = () => {
    return [...participants, ...aiBots.map(bot => ({ ...bot, isAI: true }))];
  };

  return (
    <div className="app">
      {showLogin && <LoginModal onLogin={handleLogin} />}
      
      <div className="chat-container">
        <aside className="participant-sidebar">
          <h3>참여자 ({getAllParticipants().length})</h3>
          <ParticipantList participants={getAllParticipants()} />
        </aside>

        <main className="chat-main">
          <header className="chat-header">
            <h2>그룹 채팅방</h2>
            {user && <span className="current-user">{user.name}</span>}
          </header>

          <form className="debate-toolbar" onSubmit={startDebate}>
            <input
              type="text"
              value={debateTopic}
              onChange={(e) => setDebateTopic(e.target.value)}
              placeholder="자율 토론 주제를 입력하세요"
              disabled={!socket || debateState.active}
            />
            <select
              value={debateRounds}
              onChange={(e) => setDebateRounds(Number(e.target.value))}
              disabled={!socket || debateState.active}
            >
              <option value={1}>1라운드</option>
              <option value={2}>2라운드</option>
              <option value={3}>3라운드</option>
              <option value={4}>4라운드</option>
              <option value={5}>5라운드</option>
            </select>
            <button type="submit" disabled={!socket || !debateTopic.trim() || debateState.active}>
              봇끼리 토론 시작
            </button>
          </form>

          {debateState.active && (
            <div className="debate-status">
              자율 토론 진행 중: {debateState.topic} ({debateState.rounds}라운드)
            </div>
          )}

          <div className="messages-container">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} currentUserId={user?.id} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="message-input" onSubmit={sendMessage}>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={debateState.active ? '자율 토론 중에는 사람 메시지를 보낼 수 없습니다.' : '메시지를 입력하세요...'}
              disabled={!socket || debateState.active}
            />
            <button type="submit" disabled={!inputMessage.trim() || !socket || debateState.active}>
              전송
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default App;
