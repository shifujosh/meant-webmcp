type RealtimeChannel = {
  readyState: string;
  send(payload: string): void;
  close(): void;
  onerror: unknown;
  onclose: unknown;
};

type RealtimeConnection = {
  close(): void;
  onconnectionstatechange: unknown;
  oniceconnectionstatechange: unknown;
};

type RealtimeStream = { getTracks(): Array<{ stop(): void }> };
type RealtimeAudio = { remove(): void };

const releasedChannels = new WeakSet<object>();
const releasedConnections = new WeakSet<object>();
const releasedStreams = new WeakSet<object>();
const releasedTracks = new WeakSet<object>();
const releasedAudio = new WeakSet<object>();

export function releaseRealtimeResources(input: {
  channel?: RealtimeChannel | null;
  connection?: RealtimeConnection | null;
  stream?: RealtimeStream | null;
  audio?: RealtimeAudio | null;
}) {
  const { channel, connection, stream, audio } = input;
  if (channel && !releasedChannels.has(channel)) {
    releasedChannels.add(channel);
    channel.onerror = null;
    channel.onclose = null;
    try {
      if (channel.readyState === "open") channel.send(JSON.stringify({ type: "response.cancel" }));
    } catch { /* The transport may already be gone. */ }
    try { channel.close(); } catch { /* Closing an already-failed channel is harmless. */ }
  }
  if (connection && !releasedConnections.has(connection)) {
    releasedConnections.add(connection);
    connection.onconnectionstatechange = null;
    connection.oniceconnectionstatechange = null;
    try { connection.close(); } catch { /* Closing an already-failed peer is harmless. */ }
  }
  if (stream && !releasedStreams.has(stream)) {
    releasedStreams.add(stream);
    for (const track of stream.getTracks()) {
      if (releasedTracks.has(track)) continue;
      releasedTracks.add(track);
      try { track.stop(); } catch { /* A stopped track is already safe. */ }
    }
  }
  if (audio && !releasedAudio.has(audio)) {
    releasedAudio.add(audio);
    try { audio.remove(); } catch { /* A detached audio element is already safe. */ }
  }
}
