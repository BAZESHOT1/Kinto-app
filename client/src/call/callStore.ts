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

type CallStoreState = {
  /** Входящий звонок, на который пользователь ещё не ответил. */
  incoming: IncomingCall | null;
  /** Идентификатор звонка, в котором пользователь сейчас участвует. */
  activeCallId: string | null;
  setIncoming: (call: IncomingCall | null) => void;
  setActiveCallId: (id: string | null) => void;
  /** Звонок завершён сервером: убираем приглашение и активный звонок. */
  onCallEnded: (callId: string) => void;
};

export const useCallStore = create<CallStoreState>((set, get) => ({
  incoming: null,
  activeCallId: null,
  setIncoming: (incoming) => set({ incoming }),
  setActiveCallId: (activeCallId) => set({ activeCallId }),
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
