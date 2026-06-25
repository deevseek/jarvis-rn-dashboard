import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Tab = 'dashboard' | 'control' | 'telemetry' | 'agent' | 'settings';

type Settings = {
  username: string;
  aioKey: string;
  prefix: string;
  commandAuth: string;
  apiBase: string;
  offlineAfterSec: string;
  pollMs: string;
};

type FeedState = {
  heartbeat: any;
  heartbeatTs: number;
  status: any;
  statusTs: number;
  telemetry: any;
  telemetryTs: number;
  agent: any;
  agentTs: number;
  result: any;
  resultTs: number;
  alerts: any;
  alertsTs: number;
  audit: any;
  auditTs: number;
};

const DEFAULT_SETTINGS: Settings = {
  username: 'antdev',
  aioKey: '',
  prefix: 'jarvis',
  commandAuth: '',
  apiBase: 'https://io.adafruit.com/api/v2',
  offlineAfterSec: '25',
  pollMs: '1500',
};

const SETTINGS_KEY = 'jarvis-react-native-settings-v1';
const DANGEROUS = new Set(['hard_reset', 'force_power_off', 'reset_wifi_config', 'wifi_reset', 'reboot_server', 'power_off']);

function feedKey(prefix: string, resource: string) {
  const p = sanitize(prefix || 'jarvis');
  const r = sanitize(resource);
  return `${p}-${r}`;
}

function sanitize(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'jarvis';
}

function tryJson(value: any) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function recordTs(record: any) {
  if (!record) return 0;
  const raw = record.created_at || record.updated_at || record.createdAt || record.time || record.ts;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function newest(records: any[]) {
  if (!Array.isArray(records) || records.length === 0) return null;
  return records
    .slice()
    .sort((a, b) => recordTs(b) - recordTs(a))[0];
}

function fmtAge(ms: number) {
  if (!ms) return 'NO TS';
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function uptimeText(sec: any) {
  let s = Number(sec) || 0;
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  return `${d ? `${d}d ` : ''}${h}h ${m}m`;
}

function bytes(v: any) {
  const n = Number(v) || 0;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<FeedState>({
    heartbeat: null, heartbeatTs: 0,
    status: null, statusTs: 0,
    telemetry: null, telemetryTs: 0,
    agent: null, agentTs: 0,
    result: null, resultTs: 0,
    alerts: null, alertsTs: 0,
    audit: null, auditTs: 0,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Belum refresh.');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshAll();
    if (timerRef.current) clearInterval(timerRef.current);
    const interval = Math.max(1000, Number(settings.pollMs) || 1500);
    timerRef.current = setInterval(refreshAll, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.username, settings.aioKey, settings.prefix, settings.apiBase, settings.pollMs]);

  const latestDeviceTs = Math.max(state.heartbeatTs, state.statusTs, state.telemetryTs);
  const ageSec = latestDeviceTs ? Math.max(0, Math.round((Date.now() - latestDeviceTs) / 1000)) : 999999;
  const offlineAfter = Number(settings.offlineAfterSec) || 25;
  const hb = state.heartbeat || state.status || {};
  const tel = state.telemetry || {};
  const online = !!latestDeviceTs && ageSec <= offlineAfter && hb?.online !== false;

  const feedNames = useMemo(() => ({
    command: feedKey(settings.prefix, 'command'),
    result: feedKey(settings.prefix, 'result'),
    status: feedKey(settings.prefix, 'status'),
    heartbeat: feedKey(settings.prefix, 'heartbeat'),
    telemetry: feedKey(settings.prefix, 'telemetry'),
    alerts: feedKey(settings.prefix, 'alerts'),
    agent: feedKey(settings.prefix, 'agent'),
    audit: feedKey(settings.prefix, 'audit'),
  }), [settings.prefix]);

  async function saveSettings() {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    Alert.alert('Settings tersimpan', 'Konfigurasi disimpan di storage aplikasi ini.');
    refreshAll();
  }

  async function clearSettings() {
    await AsyncStorage.removeItem(SETTINGS_KEY);
    setSettings(DEFAULT_SETTINGS);
    Alert.alert('Settings dihapus', 'Konfigurasi lokal sudah dihapus.');
  }

  function assertSettings() {
    if (!settings.username.trim()) throw new Error('Adafruit Username belum diisi.');
    if (!settings.aioKey.trim()) throw new Error('Adafruit AIO Key belum diisi.');
    if (!settings.apiBase.trim()) throw new Error('API Base belum diisi.');
  }

  function apiBaseUrl() {
    return settings.apiBase.replace(/\/$/, '');
  }

  function aioHeaders(json = false) {
    const headers: Record<string, string> = {
      'X-AIO-Key': settings.aioKey.trim(),
    };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function readFeed(resource: keyof typeof feedNames, limit = 1) {
    assertSettings();
    const base = apiBaseUrl();
    const key = feedNames[resource];
    const url = `${base}/${encodeURIComponent(settings.username)}/feeds/${encodeURIComponent(key)}/data?limit=${limit}&_=${Date.now()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: aioHeaders(),
      mode: 'cors',
    });
    if (!res.ok) throw new Error(`Read ${key} gagal: HTTP ${res.status}`);
    const records = await res.json();
    const rec = newest(records);
    const value = rec ? tryJson(rec.value) : null;
    return { value, ts: recordTs(rec), raw: records };
  }

  async function publishCommand(payload: any) {
    assertSettings();
    const base = apiBaseUrl();
    const key = feedNames.command;
    const url = `${base}/${encodeURIComponent(settings.username)}/feeds/${encodeURIComponent(key)}/data`;
    const body = JSON.stringify({ value: typeof payload === 'string' ? payload : JSON.stringify(payload) });
    const res = await fetch(url, {
      method: 'POST',
      headers: aioHeaders(true),
      body,
      mode: 'cors',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Publish ${key} gagal: HTTP ${res.status} ${text}`);
    }
    return res.json().catch(() => null);
  }

  async function refreshAll(showOk = false) {
    if (busy) return;
    setBusy(true);
    try {
      const [heartbeat, status, telemetry, result, alerts, agent, audit] = await Promise.all([
        readFeed('heartbeat'),
        readFeed('status'),
        readFeed('telemetry'),
        readFeed('result'),
        readFeed('alerts'),
        readFeed('agent'),
        readFeed('audit'),
      ]);
      setState({
        heartbeat: heartbeat.value, heartbeatTs: heartbeat.ts,
        status: status.value, statusTs: status.ts,
        telemetry: telemetry.value, telemetryTs: telemetry.ts,
        result: result.value, resultTs: result.ts,
        alerts: alerts.value, alertsTs: alerts.ts,
        agent: agent.value, agentTs: agent.ts,
        audit: audit.value, auditTs: audit.ts,
      });
      setMessage(showOk ? 'API OK. Data berhasil dibaca.' : `Last refresh ${new Date().toLocaleTimeString()}`);
    } catch (e: any) {
      setMessage(e.message || 'Refresh gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function sendCommand(command: string, durationMs?: number) {
    try {
      if (settings.commandAuth.trim() === '') {
        Alert.alert('Command Auth kosong', 'Isi Command Auth di Settings agar sama dengan firmware, atau kosongkan juga di firmware.');
        return;
      }
      const requestId = `RN-${Date.now()}`;
      const payload: any = {
        request_id: requestId,
        auth: settings.commandAuth.trim(),
        command,
        source: 'jarvis-react-native',
      };
      if (durationMs) payload.duration_ms = durationMs;
      if (DANGEROUS.has(command)) payload.confirm = 'YES_I_UNDERSTAND';
      await publishCommand(payload);
      setMessage(`Command terkirim: ${command}`);
      Alert.alert('Command terkirim', `${command}\nRequest ID: ${requestId}`);
      setTimeout(() => refreshAll(), 1600);
    } catch (e: any) {
      Alert.alert('Command gagal', e.message || 'Unknown error');
    }
  }

  function confirmCommand(command: string, durationMs?: number) {
    const dangerous = DANGEROUS.has(command);
    Alert.alert(
      dangerous ? 'Konfirmasi aksi berbahaya' : 'Kirim command',
      dangerous
        ? `Command ${command} akan dikirim dengan confirm YES_I_UNDERSTAND. Lanjutkan?`
        : `Kirim command ${command}?`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Kirim', style: dangerous ? 'destructive' : 'default', onPress: () => sendCommand(command, durationMs) },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>JARVIS EMERGENCY</Text>
          <Text style={styles.sub}>Adafruit IO Out-of-Band Control</Text>
        </View>
        <View style={[styles.pill, online ? styles.pillOk : styles.pillOff]}>
          <Text style={styles.pillText}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {(['dashboard', 'control', 'telemetry', 'agent', 'settings'] as Tab[]).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {tab === 'dashboard' && (
          <>
            <View style={styles.grid2}>
              <Stat title="DEVICE" value={hb.device || 'JARVIS'} note={hb.firmware || tel?.runtime?.firmware || '-'} />
              <Stat title="LAST SEEN" value={latestDeviceTs ? fmtAge(latestDeviceTs) : 'NO TS'} note={`Offline > ${offlineAfter}s`} danger={!online} />
              <Stat title="WIFI" value={`${hb.rssi ?? tel?.wifi?.rssi_dbm ?? '-'} dBm`} note={hb.ip || tel?.wifi?.local_ip || '-'} />
              <Stat title="UPTIME" value={uptimeText(hb.uptime_sec || tel?.runtime?.uptime_sec || 0)} note="ESP32 runtime" />
            </View>
            <SectionTitle title="Quick Emergency Actions" right={busy ? 'Refreshing...' : message} />
            <View style={styles.actions}>
              <Action label="PING JARVIS" color="cyan" onPress={() => confirmCommand('ping')} />
              <Action label="TEST POWER RELAY" color="cyan" onPress={() => confirmCommand('test_power_relay')} />
              <Action label="POWER ON" color="green" onPress={() => confirmCommand('power_on', 1000)} />
              <Action label="HARD RESET" color="yellow" onPress={() => confirmCommand('hard_reset', 1000)} />
              <Action label="FORCE POWER OFF" color="red" onPress={() => confirmCommand('force_power_off', 7000)} />
              <Action label="REFRESH" color="cyan" onPress={() => refreshAll(true)} />
            </View>
            <JsonBox title="LAST RESULT" value={state.result || 'Belum ada result.'} ts={state.resultTs} />
          </>
        )}

        {tab === 'control' && (
          <>
            <SectionTitle title="Relay Control" right="Langsung dari ESP32" />
            <View style={styles.actions}>
              <Action label="TEST POWER RELAY" color="cyan" onPress={() => confirmCommand('test_power_relay')} />
              <Action label="TEST RESET RELAY" color="cyan" onPress={() => confirmCommand('test_reset_relay')} />
              <Action label="POWER ON" color="green" onPress={() => confirmCommand('power_on', 1000)} />
              <Action label="HARD RESET" color="yellow" onPress={() => confirmCommand('hard_reset', 1000)} />
              <Action label="FORCE POWER OFF" color="red" onPress={() => confirmCommand('force_power_off', 7000)} />
              <Action label="RESTART JARVIS" color="yellow" onPress={() => confirmCommand('restart_jarvis')} />
            </View>
            <SectionTitle title="Service Control via Agent" right="Butuh agent Linux hidup" />
            <View style={styles.actions}>
              <Action label="RESTART CLOUDFLARED" color="purple" onPress={() => confirmCommand('restart_cloudflared')} />
              <Action label="RESTART NGINX" color="purple" onPress={() => confirmCommand('restart_nginx')} />
              <Action label="RESTART PHP" color="purple" onPress={() => confirmCommand('restart_php')} />
              <Action label="RESTART MYSQL" color="purple" onPress={() => confirmCommand('restart_mysql')} />
              <Action label="REBOOT SERVER" color="red" onPress={() => confirmCommand('reboot_server')} />
              <Action label="POWER OFF SERVER" color="red" onPress={() => confirmCommand('power_off')} />
            </View>
          </>
        )}

        {tab === 'telemetry' && (
          <>
            <View style={styles.grid2}>
              <Stat title="HEAP" value={`${Number(tel?.memory?.heap_used_percent || 0).toFixed(1)}%`} note={`Free ${bytes(tel?.memory?.heap_free_bytes)}`} />
              <Stat title="CHIP" value={tel?.hardware?.chip_model || '-'} note={`${tel?.hardware?.chip_cores || '-'} core • ${tel?.hardware?.cpu_freq_mhz || '-'} MHz`} />
              <Stat title="FLASH" value={bytes(tel?.flash?.flash_size_bytes)} note={`Sketch ${bytes(tel?.sketch?.sketch_size_bytes)}`} />
              <Stat title="NETWORK" value={tel?.wifi?.status || '-'} note={`${tel?.wifi?.ssid || '-'} • ${tel?.wifi?.local_ip || '-'}`} />
            </View>
            <JsonBox title="RAW TELEMETRY" value={tel || '-'} ts={state.telemetryTs} />
            <JsonBox title="ALERTS" value={state.alerts || '-'} ts={state.alertsTs} />
          </>
        )}

        {tab === 'agent' && (
          <>
            <JsonBox title="SERVER AGENT STATUS" value={state.agent || '-'} ts={state.agentTs} />
            <JsonBox title="AUDIT LOG" value={state.audit || '-'} ts={state.auditTs} />
          </>
        )}

        {tab === 'settings' && (
          <SettingsScreen
            settings={settings}
            setSettings={setSettings}
            feedNames={feedNames}
            saveSettings={saveSettings}
            clearSettings={clearSettings}
            testApi={() => refreshAll(true)}
            message={message}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ title, value, note, danger }: { title: string; value: string; note: string; danger?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.big, danger && styles.redText]} numberOfLines={1}>{value}</Text>
      <Text style={styles.muted} numberOfLines={2}>{note}</Text>
    </View>
  );
}

function SectionTitle({ title, right }: { title: string; right?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {!!right && <Text style={styles.muted}>{right}</Text>}
    </View>
  );
}

function Action({ label, color, onPress }: { label: string; color: 'cyan' | 'green' | 'yellow' | 'red' | 'purple'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.action, styles[`action_${color}`]]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function JsonBox({ title, value, ts }: { title: string; value: any; ts?: number }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <View style={styles.jsonBox}>
      <View style={styles.jsonHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.muted}>{ts ? fmtAge(ts) : ''}</Text>
      </View>
      <Text style={styles.mono}>{text}</Text>
    </View>
  );
}

function SettingsScreen({
  settings, setSettings, feedNames, saveSettings, clearSettings, testApi, message,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  feedNames: Record<string, string>;
  saveSettings: () => void;
  clearSettings: () => void;
  testApi: () => void;
  message: string;
}) {
  const update = (key: keyof Settings, value: string) => setSettings({ ...settings, [key]: value });
  return (
    <View>
      <SectionTitle title="Adafruit IO Settings" right={message} />
      <Input label="Adafruit Username" value={settings.username} onChangeText={v => update('username', v)} />
      <Input label="Adafruit AIO Key" value={settings.aioKey} onChangeText={v => update('aioKey', v)} secure />
      <Input label="Feed Prefix" value={settings.prefix} onChangeText={v => update('prefix', v)} />
      <Input label="Command Auth" value={settings.commandAuth} onChangeText={v => update('commandAuth', v)} secure />
      <Input label="API Base" value={settings.apiBase} onChangeText={v => update('apiBase', v)} />
      <Input label="Polling ms" value={settings.pollMs} onChangeText={v => update('pollMs', v)} keyboardType="number-pad" />
      <Input label="Offline setelah detik" value={settings.offlineAfterSec} onChangeText={v => update('offlineAfterSec', v)} keyboardType="number-pad" />
      <View style={styles.actions}>
        <Action label="SIMPAN" color="green" onPress={saveSettings} />
        <Action label="TEST API" color="cyan" onPress={testApi} />
        <Action label="HAPUS" color="red" onPress={clearSettings} />
      </View>
      <JsonBox title="FEEDS FIRMWARE" value={feedNames} />
    </View>
  );
}

function Input({ label, value, onChangeText, secure, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; keyboardType?: 'number-pad';
}) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
        placeholderTextColor="#5f84a3"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020712' },
  header: { padding: 18, borderBottomWidth: 1, borderColor: '#14324f', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#9eeaff', fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  sub: { color: '#8cb4d6', marginTop: 4, fontSize: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  pillOk: { backgroundColor: '#0b3a25', borderColor: '#276449' },
  pillOff: { backgroundColor: '#351017', borderColor: '#7c1e32' },
  pillText: { color: '#e5f8ff', fontWeight: '900' },
  tabs: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderColor: '#0c2035' },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#07111f', alignItems: 'center', borderWidth: 1, borderColor: '#14324f' },
  tabActive: { backgroundColor: '#0d2946', borderColor: '#38d7ff' },
  tabText: { color: '#8cb4d6', fontSize: 10, fontWeight: '800' },
  tabTextActive: { color: '#e5f8ff' },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 40 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', borderWidth: 1, borderColor: '#14324f', backgroundColor: '#07111f', borderRadius: 18, padding: 14, minHeight: 118 },
  cardTitle: { color: '#ddf7ff', fontSize: 13, fontWeight: '900', marginBottom: 8 },
  big: { color: '#9eeaff', fontSize: 24, fontWeight: '900' },
  muted: { color: '#8cb4d6', fontSize: 12 },
  redText: { color: '#ff5c7a' },
  sectionTitle: { marginTop: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitleText: { color: '#e5f8ff', fontSize: 18, fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  action: { width: '48%', minHeight: 58, borderRadius: 15, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 14 },
  actionText: { color: '#e5f8ff', fontWeight: '900' },
  action_cyan: { backgroundColor: '#08263a', borderColor: '#38d7ff' },
  action_green: { backgroundColor: '#0b2d1e', borderColor: '#32f087' },
  action_yellow: { backgroundColor: '#34280b', borderColor: '#ffd166' },
  action_red: { backgroundColor: '#351017', borderColor: '#ff5c7a' },
  action_purple: { backgroundColor: '#211437', borderColor: '#a78bfa' },
  jsonBox: { borderWidth: 1, borderColor: '#14324f', backgroundColor: '#04101d', borderRadius: 18, padding: 14, marginTop: 12 },
  jsonHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mono: { color: '#b9f6c9', fontFamily: 'monospace', fontSize: 12 },
  inputWrap: { marginBottom: 12 },
  inputLabel: { color: '#8cb4d6', fontSize: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#24517a', backgroundColor: '#030b15', color: '#e5f8ff', borderRadius: 12, padding: 12 },
});
