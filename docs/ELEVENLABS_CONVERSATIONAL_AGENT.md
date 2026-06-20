# ElevenLabs Conversational AI Agent — Integration Guide

> Deployed two-way voice agent for RayCiprocity. This is **distinct from** the
> one-way TTS voice note in `apps/web/src/lib/integrations/elevenlabs.ts`
> (`generateVoiceNote()`), which turns a script into an MP3. The Conversational Agent
> is a **live, interruptible, two-way voice conversation** the homeowner (or installer)
> can actually talk to — it listens, responds, and can call client-side tools.

## Agent

- **Name:** Reonic Agent
- **Agent ID:** `agent_4701kvj9sgeredgr35kq1bk5c4q6`
- **Auth:** public agent (`requires_auth: false`); for production/low-latency use a
  server-minted WebRTC conversation token (see below).

## Where this fits in the product

The PRD's "voice note" channel is one-way warmth-at-scale. This agent unlocks two extra
plays worth considering for the demo's wow moment:

1. **Talk-to-your-strategy** — the installer speaks to the agent to ask "why is this
   lead stalling, what should I send next?" (agent grounded in the lead's RAG context
   via `sendContextualUpdate`).
2. **Homeowner-facing voice concierge** — embed the widget in the customer portal so a
   hesitant homeowner can ask questions out loud ("does it work in winter?") and get a
   warm, human-sounding answer instead of reading a FAQ — directly attacks the
   `Überforderung` / `T2` trust codes.

Either way it strengthens the **Best Use of Eleven Labs** side-challenge entry.

## Integration methods

### 1. React SDK (`@elevenlabs/react`) — recommended for the web app

```bash
npm install @elevenlabs/react
```

```tsx
import { useConversation } from '@elevenlabs/react';

function Agent() {
  const conversation = useConversation({
    onConnect: () => console.log('Connected'),
    onDisconnect: () => console.log('Disconnected'),
    onMessage: (message) => console.log('Message:', message),
    onError: (error) => console.error('Error:', error),
    onModeChange: (mode) => console.log('Mode:', mode),
  });

  const startConversation = async () => {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    await conversation.startSession({
      agentId: 'agent_4701kvj9sgeredgr35kq1bk5c4q6',
      connectionType: 'webrtc', // or 'websocket'
    });
  };

  return (
    <div>
      <button onClick={startConversation}>Start</button>
      <button onClick={() => conversation.endSession()}>Stop</button>
      <p>Status: {conversation.status}</p>
      <p>Agent is {conversation.isSpeaking ? 'speaking' : 'listening'}</p>
    </div>
  );
}
```

Key methods:
- `connectionType: 'webrtc'` (lower latency, recommended) or `'websocket'`
- `conversation.sendUserMessage(text)` — send a text message to the agent
- `conversation.sendContextualUpdate(text)` — inject context **without** triggering a
  response (use this to feed the agent the current lead's profile, quote, and active
  problem codes)
- `conversation.sendFeedback(true/false)` — conversation feedback
- `conversation.sendUserActivity()` — signal activity to prevent interruptions
- `conversation.setVolume({ volume: 0.5 })` — output volume
- `conversation.getInputVolume()` / `getOutputVolume()` — current audio levels
- **Client tools:** define `clientTools` in options so the agent can invoke client-side
  functions (e.g. "open the financing breakdown", "log this objection as code P2")
- **Overrides:** customize `prompt`, `firstMessage`, `language`, `voiceId` via the
  `overrides` option (use `language` to switch DE/EN/NL/FR/IT per market)

### 2. React Native SDK (`@elevenlabs/react-native`)

```bash
npm install @elevenlabs/react-native @livekit/react-native @livekit/react-native-webrtc livekit-client
```

```tsx
import { ElevenLabsProvider, useConversation } from '@elevenlabs/react-native';

function App() {
  return (
    <ElevenLabsProvider>
      <ConversationScreen />
    </ElevenLabsProvider>
  );
}

function ConversationScreen() {
  const conversation = useConversation({
    onConnect: () => console.log('Connected'),
    onDisconnect: () => console.log('Disconnected'),
    onMessage: (message) => console.log('Message:', message),
    onError: (error) => console.error('Error:', error),
  });

  const start = async () => {
    await conversation.startSession({ agentId: 'agent_4701kvj9sgeredgr35kq1bk5c4q6' });
  };

  return (
    <View>
      <Button
        title={conversation.status === 'connected' ? 'Stop' : 'Start'}
        onPress={conversation.status === 'connected' ? () => conversation.endSession() : start}
      />
      <Text>Agent is {conversation.isSpeaking ? 'speaking' : 'listening'}</Text>
    </View>
  );
}
```

> Requires Expo development builds (not Expo Go). Configure mic permissions in
> `Info.plist` (iOS) and `AndroidManifest.xml` (Android).

### 3. Embeddable widget (`@elevenlabs/convai-widget`) — fastest demo path

```bash
npm install @elevenlabs/convai-widget
```

```tsx
import '@elevenlabs/convai-widget';

function App() {
  return <elevenlabs-convai agent-id="agent_4701kvj9sgeredgr35kq1bk5c4q6"></elevenlabs-convai>;
}
```

Or via CDN directly in HTML:

```html
<script src="https://elevenlabs.io/convai-widget/index.js" async></script>
<elevenlabs-convai agent-id="agent_4701kvj9sgeredgr35kq1bk5c4q6"></elevenlabs-convai>
```

This is the lowest-effort way to get a talking agent into the demo — drop it on the
lead page or customer portal and it Just Works.

### 4. Python SDK (`elevenlabs`)

```bash
pip install "elevenlabs[pyaudio]"
# macOS: brew install portaudio
# Debian/Ubuntu: sudo apt-get install libportaudio2 portaudio19-dev
```

```python
import os, signal
from elevenlabs.client import ElevenLabs
from elevenlabs.conversational_ai.conversation import Conversation
from elevenlabs.conversational_ai.default_audio_interface import DefaultAudioInterface

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

conversation = Conversation(
    client,
    agent_id="agent_4701kvj9sgeredgr35kq1bk5c4q6",
    requires_auth=False,
    audio_interface=DefaultAudioInterface(),
    callback_agent_response=lambda r: print(f"Agent: {r}"),
    callback_agent_response_correction=lambda o, c: print(f"Agent: {o} -> {c}"),
    callback_user_transcript=lambda t: print(f"User: {t}"),
)

conversation.start_session()
signal.signal(signal.SIGINT, lambda sig, frame: conversation.end_session())
conversation_id = conversation.wait_for_session_end()
print(f"Conversation ID: {conversation_id}")
```

### 5. Direct WebSocket

Endpoint:
`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_4701kvj9sgeredgr35kq1bk5c4q6`

```js
const ws = new WebSocket(
  'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_4701kvj9sgeredgr35kq1bk5c4q6'
);

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'user_transcript':
      console.log('User:', data.user_transcription_event.user_transcript);
      break;
    case 'agent_response':
      console.log('Agent:', data.agent_response_event.agent_response);
      break;
    case 'audio':
      // data.audio_event.audio_base_64 = audio chunk
      // data.audio_event.alignment = character-level timing
      break;
    case 'ping':
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'pong', event_id: data.ping_event.event_id }));
      }, data.ping_event.ping_ms);
      break;
  }
};

// Send audio chunks:  ws.send(JSON.stringify({ user_audio_chunk: base64AudioData }));
// Non-interrupting context: ws.send(JSON.stringify({ type: 'contextual_update', text: 'User clicked pricing page' }));
```

### 6. WebRTC (production, low-latency) — mint a token server-side

```js
// Server-side — never expose ELEVENLABS_API_KEY to the client
const response = await fetch(
  `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_4701kvj9sgeredgr35kq1bk5c4q6`,
  { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }
);
const { token } = await response.json();
```

Then use the token with any WebRTC-capable SDK:
- React: `conversation.startSession({ conversationToken: token, connectionType: 'webrtc' })`
- React Native: `conversation.startSession({ conversationToken: token })`
- Also available for Kotlin, Flutter, Swift

> **Recommended for our app:** a Next.js route/Server Action mints the token with the
> server-side key, the client starts a WebRTC session with that token. Keeps the API key
> off the client (same discipline as `SUPABASE_SERVICE_ROLE_KEY`).

## Environment

```bash
ELEVENLABS_API_KEY=        # already used by generateVoiceNote(); same key works here
# Agent ID is public and hard-codable, but optionally:
ELEVENLABS_AGENT_ID=agent_4701kvj9sgeredgr35kq1bk5c4q6
```

## Demo-day notes
- WebRTC needs mic permission — request it on a click, and rehearse the permission
  prompt so it doesn't surprise you on stage.
- Keep the **one-way voice note** (`generateVoiceNote`) as the bulletproof, pre-cacheable
  wow moment; use the **live agent** as the "and it can even talk back" escalation. If
  venue wifi is flaky, the live agent is the first thing to cut — the cached MP3 isn't.
- Feed the agent the lead's context with `sendContextualUpdate` (web) or
  `contextual_update` (WS) **before** the user speaks, so it answers grounded in that
  specific homeowner's quote and problem codes.

## Reference docs
- Agents overview: https://elevenlabs.io/docs/eleven-agents
- API reference: https://elevenlabs.io/docs/api-reference/introduction
- Agents API: https://elevenlabs.io/docs/api-reference/agents/get
- Conversations API: https://elevenlabs.io/docs/api-reference/conversations/get
