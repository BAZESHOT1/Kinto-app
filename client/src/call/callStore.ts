import { create } from 'zustand';

export type CallServerInfo = { id: string; url: string; domain: string; region: string };

export type IncomingCall = {
  callId: string;
  from: string;
  fromName: string;
  chatId: string | null;
  kind: string;
  channel: string;
  server: CallServerInfo;
  receivedAt: number;
};

/** Параметры звонка, которым владеет глобальный CallHost (звонок живёт, пока экран свёрнут). */
export type CallSession = {
  key: string;
  chatId: string;
  chatType: string;
  joinId: string;
  title: string;
  mesh: boolean;
  /** Постоянный голосовой топик группы (вместо обычного звонка). */
  topicId?: string;
};

type CallStoreState = {
  /** Текущий звонок (полноэкранный или свёрнутый в зелёную полосу). */
  session: CallSession | null;
  minimized: boolean;
  /** Момент соединения (мс) — для таймера в свёрнутой полосе. */
  connectedAt: number | null;
  openCall: (session: Omit<CallSession, 'key'>) => void;
  setMinimized: (minimized: boolean) => void;
  setConnectedAt: (at: number | null) => void;
  closeCall: () => void;
  /** Входящий звонок, на который пользователь ещё не ответил. */
  incoming: IncomingCall | null;
  /** Идентификатор звонка, в котором пользователь сейчас участвует. */
  activeCallId: string | null;
  setIncoming: (call: IncomingCall | null) => void;
  setActiveCallId: (id: string | null) => void;
  /** Звонок завершён сервером: убираем приглашение и активный звонок. */
  onCallEnded: (callId: string) => void;
  /** Звонок перехвачен другим устройством аккаунта: закрываем его у себя без обращения к серверу. */
  replacedCallId: string | null;
  onCallReplaced: (callId: string, exceptKey: string) => void;
};

export const useCallStore = create<CallStoreState>((set, get) => ({
  session: null,
  minimized: false,
  connectedAt: null,
  openCall: (session) => {
    // Уже идёт звонок — просто разворачиваем его (повторный запуск из чата не создаёт второй).
    const cur = get().session;
    if (cur) {
      // Тот же звонок/топик — просто разворачиваем; другой голосовой топик или звонок — отключаемся от текущего и входим в выбранный.
      const same = (session.topicId && session.topicId === cur.topicId) || (session.joinId && session.joinId === cur.joinId && !session.topicId && !cur.topicId);
      if (same || (!session.topicId && !session.joinId && !cur.topicId && !cur.joinId && session.chatId === cur.chatId)) { set({ minimized: false }); return; }
    }
    set({ session: { ...session, key: `${Date.now()}` }, minimized: false, connectedAt: null });
  },
  setMinimized: (minimized) => set({ minimized }),
  setConnectedAt: (connectedAt) => set({ connectedAt }),
  closeCall: () => set({ session: null, minimized: false, connectedAt: null }),
  incoming: null,
  activeCallId: null,
  setIncoming: (incoming) => set({ incoming }),
  setActiveCallId: (activeCallId) => set({ activeCallId }),
  replacedCallId: null,
  onCallReplaced: (callId, exceptKey) => {
    const s = get();
    if (s.session && s.activeCallId === callId && s.session.key !== exceptKey) set({ replacedCallId: callId });
    if (s.incoming?.callId === callId) set({ incoming: null });
  },
  onCallEnded: (callId) => {
    const s = get();
    set({
      incoming: s.incoming?.callId === callId ? null : s.incoming,
      activeCallId: s.activeCallId === callId ? null : s.activeCallId,
    });
  },
}));

/** Событие `call_incoming` из WebSocket → приглашение (игнорируем свои и дубли). */
export function handleCallIncomingEvent(event: Record<string, unknown>, myUserId: string | undefined): void {
  const server = event.server as CallServerInfo | undefined;
  if (typeof event.callId !== 'string' || !server?.url) return;
  if (event.from === myUserId) return;
  const s = useCallStore.getState();
  if (s.activeCallId === event.callId) return;
  // Windows-оболочка: окно может быть скрыто в трее — поднимаем его и показываем системное уведомление.
  try {
    (globalThis as { kintoDesktop?: { incomingCall?: (name: string) => void } }).kintoDesktop?.incomingCall?.(String(event.fromName ?? 'Звонок'));
  } catch { /* вне Windows-оболочки */ }
  s.setIncoming({
    callId: event.callId,
    from: String(event.from ?? ''),
    fromName: String(event.fromName ?? 'Звонок'),
    chatId: typeof event.chatId === 'string' ? event.chatId : null,
    kind: String(event.kind ?? 'direct'),
    channel: String(event.channel ?? 'internet'),
    server,
    receivedAt: Date.now(),
  });
}
