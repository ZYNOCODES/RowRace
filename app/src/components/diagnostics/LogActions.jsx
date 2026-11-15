import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Card, Chip, Icon, Modal, Text } from '../ui';
import { logger } from '../../services';
import { shareLogs } from '../../logging/shareLogs';
import { useConnection } from '../../state/connection';
import { useT } from '../../i18n';
import { colors, radius, space, touch } from '../../theme/tokens';

const PRESETS = [
  'diagnostics.presetStart',
  'diagnostics.presetReset',
  'diagnostics.presetWalkAway',
  'diagnostics.presetBack',
  'diagnostics.presetBtOff',
  'diagnostics.presetBtOn',
];

/** Test recording, "Mark event", share and clear. Used by the client during remote tests. */
export function LogActions() {
  const { t } = useT();
  const [flash, setFlash] = useState(null);
  const [marking, setMarking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileCount, setFileCount] = useState(null);

  const refreshCount = () =>
    logger
      .listFiles()
      .then((f) => setFileCount(f.length))
      .catch(() => {});
  useEffect(() => {
    refreshCount();
  }, []);
  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(id);
  }, [flash]);

  const startRecording = async () => {
    const { kind, deviceInfo } = useConnection.getState();
    await logger.restart({ testRecording: true, source: kind, device: deviceInfo?.name });
    logger.note('test recording started');
    setFlash(t('diagnostics.recordingStarted'));
    refreshCount();
  };

  const share = async () => {
    setBusy(true);
    try {
      const serial = useConnection.getState().deviceInfo?.serialNumber;
      const r = await shareLogs(logger, { deviceTag: serial || 'tablet' });
      if (!r.ok)
        setFlash(
          t(r.reason === 'no-logs' ? 'diagnostics.noLogs' : 'diagnostics.sharingUnavailable'),
        );
    } catch (e) {
      logger.error(e, { where: 'shareLogs' });
      setFlash(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    await logger.clear();
    setFlash(t('diagnostics.cleared'));
    refreshCount();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Button
          label={t('diagnostics.startRecording')}
          icon={<Icon name="dot" color={colors.onFill} />}
          onPress={startRecording}
        />
        <Button
          label={t('diagnostics.markEvent')}
          variant="accent"
          icon={<Icon name="marker" color={colors.onFill} />}
          onPress={() => setMarking(true)}
        />
        <Button
          label={t('diagnostics.shareLogs')}
          variant="secondary"
          icon={<Icon name="share" />}
          loading={busy}
          onPress={share}
        />
        <Button
          label={t('diagnostics.clearLogs')}
          variant="ghost"
          icon={<Icon name="trash" />}
          onPress={() => setConfirmClear(true)}
        />
      </View>
      <View style={styles.row}>
        {fileCount != null && (
          <Text variant="bodySecondary">{t('diagnostics.logFiles', { count: fileCount })}</Text>
        )}
        {flash && (
          <Text variant="body" color={colors.success} accessibilityLiveRegion="polite">
            {flash}
          </Text>
        )}
      </View>

      <MarkEventModal
        visible={marking}
        onClose={() => setMarking(false)}
        onSaved={() => {
          setMarking(false);
          setFlash(t('diagnostics.markSaved'));
        }}
      />
      <Modal
        visible={confirmClear}
        title={t('diagnostics.clearTitle')}
        message={t('diagnostics.clearMessage')}
        onRequestClose={() => setConfirmClear(false)}
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirmClear(false) },
          { label: t('diagnostics.clear'), onPress: clear, variant: 'danger' },
        ]}
      />
    </Card>
  );
}

function MarkEventModal({ visible, onClose, onSaved }) {
  const { t } = useT();
  const [text, setText] = useState('');
  const save = (value) => {
    const v = value.trim();
    if (!v) return;
    logger.note(v);
    logger.flush();
    setText('');
    onSaved();
  };
  return (
    <Modal
      visible={visible}
      title={t('diagnostics.markTitle')}
      onRequestClose={onClose}
      actions={[
        { label: t('common.cancel'), onPress: onClose },
        { label: t('common.save'), onPress: () => save(text), variant: 'primary' },
      ]}
    >
      <View style={styles.presets}>
        {PRESETS.map((k) => (
          <Chip key={k} label={t(k)} onPress={() => save(t(k))} />
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('diagnostics.markPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        onSubmitEditing={() => save(text)}
        returnKeyType="done"
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    minHeight: touch.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: space.md,
    fontSize: 18,
  },
});
