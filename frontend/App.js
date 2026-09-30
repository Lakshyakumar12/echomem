/**
 * EchoMem v2 — React Native UI
 * Dark-mode therapeutic interface for AI Echo breakup recovery app.
 *
 * Features:
 *  - Fixed Telemetry Bar (compression ratio, detected state, token counts)
 *  - Chat feed with user/AI bubbles + Conflict Alert pills
 *  - Memory Drawer Modal (Tab 1: Episodic Triggers | Tab 2: Core Identity)
 *  - Fast-forward 7 Days decay simulation button
 *
 * IMPORTANT: Set API_BASE to your machine's local IP when running on a device.
 *   - Find your IP: run `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
 *   - Example: 'http://192.168.1.45:8000'
 *   - localhost works ONLY for iOS Simulator / Android Emulator, not real devices.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = 'http://192.168.0.160:8000'; // <-- UPDATE to your LAN IP for physical devices
const USER_ID = 'echo_demo_user_2';

// ─── DESIGN SYSTEM ───────────────────────────────────────────────────────────
const T = {
  bg: '#0A0A0F',
  surface: '#121218',
  elevated: '#1A1A25',
  border: '#242436',
  accent: '#8B5CF6',
  accentDim: 'rgba(139,92,246,0.16)',
  accentBorder: 'rgba(139,92,246,0.35)',
  conflict: '#EF4444',
  conflictDim: 'rgba(239,68,68,0.14)',
  conflictBorder: 'rgba(239,68,68,0.35)',
  success: '#10B981',
  successDim: 'rgba(16,185,129,0.14)',
  amber: '#F59E0B',
  amberDim: 'rgba(245,158,11,0.14)',
  amberBorder: 'rgba(245,158,11,0.35)',
  text: '#F0EFF9',
  dim: '#7B7B96',
  muted: '#44445A',
};

const SCREEN_W = Dimensions.get('window').width;

// ─── UTILITY HELPERS ─────────────────────────────────────────────────────────

/** Returns a status-appropriate color for the detected emotional state. */
function stateColor(state) {
  if (!state) return T.dim;
  const s = state.toLowerCase();
  if (s.includes('crisis') || s.includes('relapse risk')) return T.conflict;
  if (s.includes('ambivalence') || s.includes('grief') || s.includes('spike')) return T.amber;
  if (s.includes('progress') || s.includes('momentum') || s.includes('maintained')) return T.success;
  return T.accent;
}

/** Returns a color based on trigger intensity (1-10). */
function intensityColor(i) {
  if (i >= 8) return T.conflict;
  if (i >= 5) return T.amber;
  return T.success;
}

/** Formats an ISO timestamp to HH:MM. */
function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ─── ROOT APP ────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [telemetry, setTelemetry] = useState(null);
  const [detectedState, setDetectedState] = useState('');
  const [memoryData, setMemoryData] = useState({
    core_traits: [],
    episodic_triggers: [],
    ambivalence_records: [],
  });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('episodic');
  const [decaying, setDecaying] = useState(false);

  const scrollRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { id: Date.now(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
        const res = await fetch(API_BASE + '/chat',{
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, message: text }),
      });

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'ai',
          text: data.reply,
          conflictAlert: data.conflict_alert,
          state: data.detected_state,
        },
      ]);

      setTelemetry(data.telemetry);
      setDetectedState(data.detected_state || '');
      setMemoryData(data.memory_breakdown || memoryData);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'error',
          text: `⚠ Connection failed: ${err.message}\n\nMake sure the backend is running and API_BASE is your machine's local IP.`,
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading, scrollToBottom, memoryData]);

  // ── Refresh memory graph from server ─────────────────────────────────────
  const fetchMemoryGraph = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + '/memory-graph/' + USER_ID);
      const data = await res.json();
      
      // 1. Handle backend returning flat keys directly
      const core = data.core_traits || [];
      const episodic = data.episodic_triggers || [];
      const ambivalence = data.ambivalence || data.ambivalence_records || [];

      // 2. Map raw Mem0 database objects to the format the UI expects
      setMemoryData({
        core_traits: core.map(t => ({
          key: t.metadata?.key || 'trait',
          fact: t.memory?.includes(' is: ') ? t.memory.split(' is: ')[1] : t.memory,
          confidence: t.metadata?.confidence || 0.9,
        })),
        episodic_triggers: episodic.map(e => ({
          trigger: (e.memory || '').replace('Trigger: ', '').trim(),
          intensity: e.metadata?.intensity || 5,
          timestamp: e.metadata?.timestamp || '',
          decayed: Boolean(e.metadata?.decayed),
        })),
        ambivalence_records: ambivalence.map(a => ({
          key: a.metadata?.key || 'conflict',
          old_fact: a.metadata?.old_fact || '',
          new_fact: a.metadata?.new_fact || '',
          timestamp: a.metadata?.timestamp || '',
        }))
      });
    } catch (e) {
      console.warn('[EchoMem] Memory graph fetch failed:', e.message);
    }
    }, []);

  // ── Open memory drawer ────────────────────────────────────────────────────
  const openDrawer = useCallback(async () => {
    await fetchMemoryGraph();
    setDrawerVisible(true);
  }, [fetchMemoryGraph]);

  // ── Simulate 7-day decay ──────────────────────────────────────────────────
  const handleDecay = useCallback(async () => {
    if (decaying) return;
    setDecaying(true);
    try {
await fetch(API_BASE + '/simulate-decay/' + USER_ID, { method: 'POST' });      // Brief pause so Mem0 BG task settles, then refresh
      await new Promise((r) => setTimeout(r, 800));
      await fetchMemoryGraph();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'system',
          text: '⏩ 7 days simulated — episodic triggers have faded. Core identity insights remain intact.',
        },
      ]);
      scrollToBottom();
    } catch (e) {
      console.warn('[EchoMem] Decay simulation failed:', e.message);
    } finally {
      setDecaying(false);
    }
  }, [decaying, fetchMemoryGraph, scrollToBottom]);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* ─── Telemetry Bar ─────────────────────────────────────────────────── */}
      <TelemetryBar telemetry={telemetry} detectedState={detectedState} />

      <KeyboardAvoidingView
        style={s.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* ─── Chat Feed ─────────────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={s.chatFeed}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && <EmptyState />}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {loading && <TypingIndicator />}
        </ScrollView>

        {/* ─── Input Row ─────────────────────────────────────────────────── */}
        <View style={s.inputRow}>
          <TouchableOpacity style={s.memBtn} onPress={openDrawer} activeOpacity={0.7}>
            <Text style={s.memBtnText}>🧠</Text>
          </TouchableOpacity>

          <TextInput
            style={s.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Share what you're feeling…"
            placeholderTextColor={T.muted}
            multiline
            maxLength={1200}
            returnKeyType="default"
          />

          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={s.sendBtnIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ─── Fast-Forward 7 Days Button ────────────────────────────────── */}
        <TouchableOpacity
          style={[s.decayBtn, decaying && s.decayBtnLoading]}
          onPress={handleDecay}
          disabled={decaying}
          activeOpacity={0.75}
        >
          {decaying ? (
            <ActivityIndicator color={T.amber} size="small" />
          ) : (
            <Text style={s.decayBtnText}>⏩ Fast-forward 7 Days</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* ─── Memory Drawer ─────────────────────────────────────────────────── */}
      <MemoryDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        memoryData={memoryData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </SafeAreaView>
  );
}

// ─── TELEMETRY BAR ────────────────────────────────────────────────────────────

function TelemetryBar({ telemetry, detectedState }) {
  const hasData = telemetry || detectedState;

  if (!hasData) {
    return (
      <View style={s.telemetryBar}>
        <Text style={s.telemetryPlaceholder}>EchoMem v2 · Hierarchical Memory Engine</Text>
      </View>
    );
  }

  const color = stateColor(detectedState);

  return (
    <View style={s.telemetryBar}>
      {telemetry && (
        <View style={s.compressionBadge}>
          <Text style={s.compressionText}>{telemetry.compression_ratio} Token Reduction</Text>
        </View>
      )}

      {telemetry && (
        <Text style={s.tokenMeta}>
          {telemetry.raw_tokens}→{telemetry.memory_tokens} tok · {telemetry.latency_ms}ms
        </Text>
      )}

      {detectedState ? (
        <View style={[s.statePill, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          <View style={[s.stateDot, { backgroundColor: color }]} />
          <Text style={[s.stateLabel, { color }]}>{detectedState}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── MESSAGE BUBBLE ───────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  if (msg.role === 'system') {
    return (
      <View style={s.systemRow}>
        <Text style={s.systemText}>{msg.text}</Text>
      </View>
    );
  }

  if (msg.role === 'error') {
    return (
      <View style={s.systemRow}>
        <Text style={[s.systemText, { color: T.conflict }]}>{msg.text}</Text>
      </View>
    );
  }

  const isUser = msg.role === 'user';

  return (
    <View style={[s.bubbleRow, isUser ? s.bubbleRowRight : s.bubbleRowLeft]}>
      {!isUser && <Text style={s.avatarEmoji}>🌀</Text>}

      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAI]}>
        <Text style={[s.bubbleText, isUser ? s.bubbleTextUser : s.bubbleTextAI]}>
          {msg.text}
        </Text>

        {/* Conflict / Ambivalence Alert Pill */}
        {msg.conflictAlert && (
          <View style={s.conflictPill}>
            <Text style={s.conflictPillText}>⚡ Emotional Ambivalence Detected & Logged</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── TYPING INDICATOR ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <View style={[s.bubbleRow, s.bubbleRowLeft]}>
      <Text style={s.avatarEmoji}>🌀</Text>
      <View style={[s.bubble, s.bubbleAI, s.typingBubble]}>
        <Text style={s.typingText}>Echo is reflecting…</Text>
      </View>
    </View>
  );
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={s.emptyWrap}>
      <Text style={s.emptyIcon}>🌀</Text>
      <Text style={s.emptyTitle}>EchoMem v2</Text>
      <Text style={s.emptySub}>
        Share what's on your mind.{'\n'}Echo remembers, learns, and heals with you.
      </Text>
      <View style={s.emptyHints}>
        <Text style={s.emptyHint}>💡 Tap 🧠 to view your memory graph</Text>
        <Text style={s.emptyHint}>⏩ Use "Fast-forward 7 Days" to watch triggers fade</Text>
      </View>
    </View>
  );
}

// ─── MEMORY DRAWER ────────────────────────────────────────────────────────────

function MemoryDrawer({ visible, onClose, memoryData, activeTab, setActiveTab }) {
  const coreCount = memoryData.core_traits?.length || 0;
  const episodicCount = memoryData.episodic_triggers?.length || 0;
  const ambivalenceCount = memoryData.ambivalence_records?.length || 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlayWrap}>
        {/* Tap outside to close */}
        <TouchableOpacity style={s.overlayDismiss} onPress={onClose} activeOpacity={1} />

        <View style={s.drawerContainer}>
          {/* Header */}
          <View style={s.drawerHeader}>
            <View>
              <Text style={s.drawerTitle}>Memory Graph</Text>
              <Text style={s.drawerMeta}>
                {coreCount} core traits · {episodicCount} triggers · {ambivalenceCount} ambivalence events
              </Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Ambivalence Banner */}
          {ambivalenceCount > 0 && (
            <View style={s.conflictBanner}>
              <Text style={s.conflictBannerText}>
                ⚡ {ambivalenceCount} Emotional Ambivalence Event{ambivalenceCount > 1 ? 's' : ''} Logged
              </Text>
            </View>
          )}

          {/* Tab Bar */}
          <View style={s.tabBar}>
            <TouchableOpacity
              style={[s.tab, activeTab === 'episodic' && s.tabActive]}
              onPress={() => setActiveTab('episodic')}
            >
              <Text style={[s.tabText, activeTab === 'episodic' && s.tabTextActive]}>
                ⚡ Episodic Triggers
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, activeTab === 'core' && s.tabActive]}
              onPress={() => setActiveTab('core')}
            >
              <Text style={[s.tabText, activeTab === 'core' && s.tabTextActive]}>
                🔒 Core Identity
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          <ScrollView style={s.drawerBody} showsVerticalScrollIndicator={false}>
            {activeTab === 'episodic' ? (
              <EpisodicTab triggers={memoryData.episodic_triggers || []} />
            ) : (
              <CoreTraitsTab
                traits={memoryData.core_traits || []}
                ambivalence={memoryData.ambivalence_records || []}
              />
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── EPISODIC TAB ─────────────────────────────────────────────────────────────

function EpisodicTab({ triggers }) {
  if (!triggers.length) {
    return (
      <Text style={s.emptyTabText}>
        No episodic triggers recorded yet.{'\n'}Share what's on your mind to start building your memory.
      </Text>
    );
  }

  // Sort by intensity descending
  const sorted = [...triggers].sort((a, b) => (b.intensity || 0) - (a.intensity || 0));

  return (
    <View>
      {sorted.map((t, i) => (
        <EpisodicCard key={i} trigger={t} />
      ))}
    </View>
  );
}

function EpisodicCard({ trigger }) {
  const intensity = trigger.intensity || 5;
  const color = intensityColor(intensity);
  const isDecayed = trigger.decayed;
  const fillPct = `${Math.round((intensity / 10) * 100)}%`;

  return (
    <View style={[s.card, { borderLeftColor: color }]}>
      {/* Card Header */}
      <View style={s.cardHeader}>
        <View style={[s.intensityBadge, { backgroundColor: color + '22', borderColor: color + '40' }]}>
          <Text style={[s.intensityText, { color }]}>Intensity {intensity}/10</Text>
        </View>

        {isDecayed && (
          <View style={s.decayedBadge}>
            <Text style={s.decayedText}>↓ Faded</Text>
          </View>
        )}

        <Text style={s.cardTime}>{formatTime(trigger.timestamp)}</Text>
      </View>

      {/* Trigger Text */}
      <Text style={s.cardTriggerText}>{trigger.trigger}</Text>

      {/* Intensity Progress Bar */}
      <View style={s.intensityBarTrack}>
        <View
          style={[
            s.intensityBarFill,
            { width: fillPct, backgroundColor: color, opacity: isDecayed ? 0.4 : 1 },
          ]}
        />
      </View>
    </View>
  );
}

// ─── CORE TRAITS TAB ──────────────────────────────────────────────────────────

function CoreTraitsTab({ traits, ambivalence }) {
  if (!traits.length && !ambivalence.length) {
    return (
      <Text style={s.emptyTabText}>
        No core traits identified yet.{'\n'}Continue sharing to build your long-term memory profile.
      </Text>
    );
  }

  return (
    <View>
      {traits.length > 0 && (
        <>
          <Text style={s.sectionLabel}>STABLE IDENTITY FACTS</Text>
          {traits.map((t, i) => (
            <CoreTraitRow key={i} trait={t} />
          ))}
        </>
      )}

      {ambivalence.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { color: T.amber, marginTop: 20 }]}>
            EMOTIONAL AMBIVALENCE LOG
          </Text>
          {ambivalence.map((a, i) => (
            <AmbivalenceCard key={i} record={a} />
          ))}
        </>
      )}
    </View>
  );
}

function CoreTraitRow({ trait }) {
  const confidence = Math.round((trait.confidence || 0.8) * 100);
  return (
    <View style={[s.card, { borderLeftColor: T.success }]}>
      <View style={s.traitRowInner}>
        <View style={s.traitTextBlock}>
          <Text style={s.traitKey}>{(trait.key || '').replace(/_/g, ' ')}</Text>
          <Text style={s.traitFact}>{trait.fact}</Text>
        </View>
        <View style={[s.confidenceBadge, { backgroundColor: T.success + '1A' }]}>
          <Text style={[s.confidenceText, { color: T.success }]}>{confidence}%</Text>
        </View>
      </View>
    </View>
  );
}

function AmbivalenceCard({ record }) {
  return (
    <View style={[s.card, { borderLeftColor: T.amber, backgroundColor: T.amberDim }]}>
      <Text style={[s.traitKey, { color: T.amber }]}>{(record.key || '').replace(/_/g, ' ')}</Text>
      <Text style={s.ambivalenceWas}>
        <Text style={{ color: T.dim }}>Was: </Text>
        {record.old_fact}
      </Text>
      <Text style={s.ambivalenceNow}>
        <Text style={{ color: T.dim }}>Now: </Text>
        {record.new_fact}
      </Text>
      {record.timestamp && (
        <Text style={[s.cardTime, { marginTop: 6 }]}>{formatTime(record.timestamp)}</Text>
      )}
    </View>
  );
}

// ─── STYLESHEET ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
root: { 
    flex: 1, 
    backgroundColor: T.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, 
  },
  flex1: { flex: 1 },

  // ── Telemetry Bar
  telemetryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    minHeight: 50,
  },
  telemetryPlaceholder: { color: T.dim, fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },
  compressionBadge: {
    backgroundColor: T.accentDim,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: T.accentBorder,
  },
  compressionText: { color: T.accent, fontSize: 12, fontWeight: '700' },
  tokenMeta: { color: T.dim, fontSize: 11, fontVariant: ['tabular-nums'] },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
    borderWidth: 1,
  },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  stateLabel: { fontSize: 11, fontWeight: '600' },

  // ── Chat Feed
  chatFeed: { flex: 1 },
  chatContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },

  // ── Bubbles
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  avatarEmoji: { fontSize: 22, marginRight: 8, marginBottom: 2 },
  bubble: {
    maxWidth: SCREEN_W * 0.78,
    borderRadius: 18,
    padding: 13,
  },
  bubbleUser: {
    backgroundColor: T.accent,
    borderBottomRightRadius: 5,
  },
  bubbleAI: {
    backgroundColor: T.elevated,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: T.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#FFFFFF' },
  bubbleTextAI: { color: T.text },

  // Conflict Pill (inside AI bubble)
  conflictPill: {
    marginTop: 10,
    backgroundColor: T.conflictDim,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: T.conflictBorder,
  },
  conflictPillText: { color: T.conflict, fontSize: 11, fontWeight: '700' },

  // Typing
  typingBubble: { paddingVertical: 12 },
  typingText: { color: T.dim, fontSize: 14, fontStyle: 'italic' },

  // System / Error messages
  systemRow: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 8 },
  systemText: {
    color: T.amber,
    fontSize: 12,
    fontWeight: '500',
    backgroundColor: T.amberDim,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    textAlign: 'center',
    overflow: 'hidden',
  },

  // ── Empty State
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyIcon: { fontSize: 60, marginBottom: 18 },
  emptyTitle: { color: T.text, fontSize: 26, fontWeight: '700', marginBottom: 10 },
  emptySub: {
    color: T.dim,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 24,
  },
  emptyHints: { gap: 8, alignItems: 'flex-start' },
  emptyHint: { color: T.muted, fontSize: 13 },

  // ── Input Row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  memBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: T.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  memBtnText: { fontSize: 20 },
  textInput: {
    flex: 1,
    backgroundColor: T.elevated,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    color: T.text,
    fontSize: 15,
    maxHeight: 130,
    lineHeight: 21,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: T.muted },
  sendBtnIcon: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginTop: -2 },

  // ── Fast-Forward Decay Button
  decayBtn: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: T.amberDim,
    borderWidth: 1,
    borderColor: T.amberBorder,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  decayBtnLoading: { opacity: 0.55 },
  decayBtnText: { color: T.amber, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },

  // ── Memory Drawer Modal
  overlayWrap: { flex: 1, justifyContent: 'flex-end' },
  overlayDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  drawerContainer: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '84%',
    borderTopWidth: 1,
    borderColor: T.border,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  drawerTitle: { color: T.text, fontSize: 19, fontWeight: '700' },
  drawerMeta: { color: T.dim, fontSize: 12, marginTop: 3 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  closeBtnText: { color: T.dim, fontSize: 14 },

  // Conflict Banner
  conflictBanner: {
    backgroundColor: T.conflictDim,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: T.conflictBorder,
  },
  conflictBannerText: { color: T.conflict, fontSize: 13, fontWeight: '700' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: T.accent },
  tabText: { color: T.muted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: T.accent },

  drawerBody: { paddingHorizontal: 16, paddingTop: 16 },
  emptyTabText: {
    color: T.dim,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
    lineHeight: 22,
  },

  // ── Memory Cards (shared)
  card: {
    backgroundColor: T.elevated,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  cardTime: { color: T.muted, fontSize: 11, marginLeft: 'auto' },

  // Intensity Badge
  intensityBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  intensityText: { fontSize: 11, fontWeight: '700' },

  // Decay Badge
  decayedBadge: {
    backgroundColor: T.muted + '28',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  decayedText: { color: T.muted, fontSize: 11, fontWeight: '600' },

  cardTriggerText: { color: T.text, fontSize: 14, lineHeight: 21, marginBottom: 10 },

  // Intensity Bar
  intensityBarTrack: {
    height: 4,
    backgroundColor: T.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  intensityBarFill: { height: 4, borderRadius: 2 },

  // ── Core Trait Row
  sectionLabel: {
    color: T.dim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  traitRowInner: { flexDirection: 'row', alignItems: 'center' },
  traitTextBlock: { flex: 1 },
  traitKey: {
    color: T.dim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  traitFact: { color: T.text, fontSize: 14, fontWeight: '500' },
  confidenceBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 10,
  },
  confidenceText: { fontSize: 12, fontWeight: '700' },

  // ── Ambivalence Card
  ambivalenceWas: { color: T.text, fontSize: 13, marginBottom: 4, lineHeight: 19 },
  ambivalenceNow: { color: T.text, fontSize: 13, lineHeight: 19 },
});
