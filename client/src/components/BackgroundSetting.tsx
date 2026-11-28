/**
 * Настройка фона чата / профиля: превью и окно выбора.
 * В окне: «Фото» (своё изображение, зашифрованное на узлах) или «Библиотека» процедурных фонов
 * (Aurora, Dither, Pixel Blast) с акцентным цветом (по умолчанию монохром) и переключателем анимации
 * (по умолчанию выключена).
 */
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AvatarInfo } from '../data/api';
import { pickImage, uploadImage, type UploadedImage } from '../data/imageUpload';
import { useStore } from '../state/useStore';
import { ACCENTS, type AccentName } from '../theme/theme';
import { useTheme } from '../theme/useTheme';
import { PROCEDURAL_LIBRARY, makeProcedural, parseProcedural, type ProceduralId, type ProceduralSettings } from '../backgrounds/catalog';
import { ProceduralBackground } from '../backgrounds/ProceduralBackground';
import { Btn } from './Btn';
import { Wallpaper } from './Wallpaper';

const ACCENT_LIST = Object.keys(ACCENTS) as AccentName[];

export function BackgroundSetting({
  title = 'Фон',
  hint,
  current,
  onSave,
  onRemove,
}: {
  title?: string;
  hint?: string;
  current?: AvatarInfo | null;
  /** Сохранить фон на Hub: загруженное изображение или процедурный фон. */
  onSave: (image: { objectId: string; key: string; mime: string }) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const theme = useTheme();
  const pushToast = useStore((s) => s.pushToast);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'photo' | 'library'>('library');
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [step, setStep] = React.useState('');
  const [progress, setProgress] = React.useState(0);
  const [preview, setPreview] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const currentProc = parseProcedural(current);
  const [sel, setSel] = React.useState<ProceduralSettings>({ id: 'aurora', color: null, animated: false });
  React.useEffect(() => setPreview(null), [current?.objectId]);
  React.useEffect(() => {
    if (open && currentProc) setSel(currentProc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function choosePhoto() {
    if (busy || removing) return;
    const picked = await pickImage().catch(() => null);
    if (!picked) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setProgress(0);
    try {
      const uploaded: UploadedImage = await uploadImage(picked, {
        maxDim: 1800,
        signal: controller.signal,
        onStep: setStep,
        onProgress: setProgress,
      });
      setPreview(uploaded.preview);
      setStep('Сохранение…');
      await onSave({ objectId: uploaded.objectId, key: uploaded.key, mime: uploaded.mime });
      pushToast({ kind: 'success', message: 'Фон обновлён' });
      setOpen(false);
    } catch (e) {
      setPreview(null);
      if (!(e instanceof Error && e.name === 'AbortError')) {
        pushToast({ kind: 'error', message: e instanceof Error ? e.message : 'Не удалось сменить фон' });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStep('');
    }
  }

  async function applyProcedural() {
    if (busy || removing) return;
    setBusy(true);
    try {
      setStep('Сохранение…');
      await onSave(makeProcedural(sel));
      setPreview(null);
      pushToast({ kind: 'success', message: 'Фон обновлён' });
      setOpen(false);
    } catch (e) {
      pushToast({ kind: 'error', message: e instanceof Error ? e.message : 'Не удалось сменить фон' });
    } finally {
      setBusy(false);
      setStep('');
    }
  }

  async function remove() {
    if (busy || removing) return;
    setRemoving(true);
    try {
      await onRemove();
      setPreview(null);
      pushToast({ kind: 'success', message: 'Фон сброшен' });
      setOpen(false);
    } catch (e) {
      pushToast({ kind: 'error', message: e instanceof Error ? e.message : 'Не удалось убрать фон' });
    } finally {
      setRemoving(false);
    }
  }

  const has = Boolean(preview || current);
  const pick = (id: ProceduralId) => setSel((s) => ({ ...s, id }));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="color-palette-outline" size={17} color={theme.accent} />
        <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '700' }}>{title}</Text>
      </View>
      {hint ? <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 17 }}>{hint}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Выбрать фон"
          style={({ pressed }) => ({ width: 92, height: 150, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.line, opacity: pressed ? 0.8 : 1 })}
        >
          <Wallpaper image={current} previewUri={preview} dim={0.15} pattern />
        </Pressable>
        <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
          <Btn title={has ? 'Изменить фон' : 'Выбрать фон'} size="s" onPress={() => setOpen(true)} />
          <Btn title="Стандартный фон" size="s" variant="ghost" loading={removing} disabled={!current || busy || removing} onPress={() => void remove()} />
        </View>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => !busy && setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 14 }} onPress={() => !busy && setOpen(false)}>
          <Pressable
            onPress={() => undefined}
            style={{ alignSelf: 'center', width: '100%', maxWidth: 520, maxHeight: '92%', borderRadius: 24, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surfaceElevated, overflow: 'hidden' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 }}>
              <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '800' }}>Фон</Text>
              <Pressable onPress={() => !busy && setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Закрыть">
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
              {([['library', 'Библиотека'], ['photo', 'Фото']] as const).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  accessibilityRole="tab"
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: tab === key ? theme.accentSoft : theme.surface, borderWidth: 1, borderColor: tab === key ? theme.accent : theme.line }}
                >
                  <Text style={{ color: tab === key ? theme.accent : theme.textSecondary, fontWeight: '700' }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18, gap: 14 }}>
              {tab === 'photo' ? (
                <View style={{ gap: 12 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
                    Своё изображение. Оно шифруется и хранится на узлах сети, расшифровывается только на устройствах участников.
                  </Text>
                  <Btn title={busy ? `Загрузка… ${progress}%` : has && !currentProc ? 'Сменить фото' : 'Выбрать фото'} loading={busy} disabled={busy || removing} onPress={() => void choosePhoto()} />
                  {busy ? (
                    <Pressable onPress={() => abortRef.current?.abort()} accessibilityRole="button" hitSlop={6}>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{step || 'Обработка…'} · отменить</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {PROCEDURAL_LIBRARY.map((p) => {
                      const selected = sel.id === p.id;
                      return (
                        <Pressable key={p.id} onPress={() => pick(p.id)} accessibilityRole="radio" accessibilityState={{ selected }} style={{ flex: 1, gap: 6 }}>
                          <View style={{ height: 150, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: selected ? theme.accent : theme.line }}>
                            <ProceduralBackground settings={{ id: p.id, color: sel.color, animated: selected && sel.animated }} dark={theme.dark} />
                          </View>
                          <Text style={{ color: selected ? theme.accent : theme.textPrimary, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>{p.title}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 12.5 }}>{PROCEDURAL_LIBRARY.find((p) => p.id === sel.id)?.hint}</Text>

                  <View style={{ gap: 8 }}>
                    <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 14 }}>Цвет</Text>
                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                      <Pressable
                        onPress={() => setSel((s) => ({ ...s, color: null }))}
                        accessibilityRole="radio"
                        accessibilityLabel="Монохром"
                        style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#9aa0a6', borderWidth: 3, borderColor: sel.color === null ? theme.textPrimary : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#ffffff' }} />
                      </Pressable>
                      {ACCENT_LIST.map((name) => (
                        <Pressable
                          key={name}
                          onPress={() => setSel((s) => ({ ...s, color: ACCENTS[name].color }))}
                          accessibilityRole="radio"
                          accessibilityLabel={ACCENTS[name].label}
                          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENTS[name].color, borderWidth: 3, borderColor: sel.color === ACCENTS[name].color ? theme.textPrimary : 'transparent' }}
                        />
                      ))}
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>По умолчанию — монохром.</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 14 }}>Анимация</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>Выключена по умолчанию: статичный кадр экономит заряд батареи.</Text>
                    </View>
                    <Switch value={sel.animated} onValueChange={(v) => setSel((s) => ({ ...s, animated: v }))} trackColor={{ true: theme.accent }} accessibilityLabel="Анимация фона" />
                  </View>

                  <Btn title={busy ? 'Сохранение…' : 'Применить'} loading={busy} disabled={busy || removing} onPress={() => void applyProcedural()} />
                </>
              )}
              {busy && tab === 'library' ? <ActivityIndicator color={theme.accent} /> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
