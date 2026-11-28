// iOS / Android: регистрируем WebRTC-глобали LiveKit ДО любого кода звонков (вызывается из index.js).
import { registerGlobals } from '@livekit/react-native';

registerGlobals();
