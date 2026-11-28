/**
 * Подраздел «Приглашения»: кто может приглашать в группу (все / только администрация).
 * В открытых группах по умолчанию приглашают все, в закрытых и частных — только администрация.
 * Персональное разрешение или запрет участнику выставляется в списке участников.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { useStore } from '../../state/useStore';
import * as api from '../../data/api';
import { ManageChips, ManageSection } from './ManageUI';
import { manageError } from './ManageData';
import type { ManageChat } from './ManageTypes';

export function ManageInvitePolicy({ chat, onChanged }: { chat: ManageChat; onChanged: () => Promise<void> | void }) {
  const theme = useTheme();
  const pushToast = useStore((s) => s.pushToast);
  const current = (chat as ManageChat & { invitePolicy?: 'all' | 'admins' }).invitePolicy ?? (chat.visibility === 'public' ? 'all' : 'admins');
  const [value, setValue] = React.useState<'all' | 'admins'>(current);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setValue(current), [current]);

  async function change(next: 'all' | 'admins') {
    if (busy || next === value) return;
    setBusy(true);
    const prev = value;
    setValue(next);
    try {
      await api.api.setInvitePolicy(chat.id, next);
      pushToast({ kind: 'success', message: next === 'all' ? 'Приглашать могут все участники' : 'Приглашать может только администрация' });
      await onChanged();
    } catch (e: unknown) {
      setValue(prev);
      pushToast({ kind: 'error', message: manageError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ManageSection
      icon="person-add-outline"
      title="Кто может приглашать"
      subtitle="Участники с правом «Ссылки» (администрация) приглашают всегда. Конкретному человеку можно разрешить или запретить приглашать в списке участников."
    >
      <ManageChips
        items={[
          { key: 'all', label: 'Все' },
          { key: 'admins', label: 'Только администрация' },
        ]}
        value={value}
        onChange={(key) => void change(key as 'all' | 'admins')}
      />
      <View style={{ marginTop: 10 }}>
        <Text style={{ color: theme.textDisabled, fontSize: 11.5, lineHeight: 16 }}>
          {chat.visibility === 'public'
            ? 'Группа открытая: по умолчанию приглашать могут все.'
            : 'Группа закрытая или частная: по умолчанию приглашает только администрация.'}
        </Text>
      </View>
    </ManageSection>
  );
}
