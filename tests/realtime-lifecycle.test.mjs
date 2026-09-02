import assert from "node:assert/strict";
import test from "node:test";

import { releaseRealtimeResources } from "../lib/meant/realtime-lifecycle.ts";

test("realtime cleanup stops every track, closes transport resources, and removes audio", () => {
  const events = [];
  const channel = {
    readyState: "open",
    onerror: () => undefined,
    onclose: () => undefined,
    send: (payload) => events.push(["send", payload]),
    close: () => events.push(["channel.close"]),
  };
  const connection = {
    onconnectionstatechange: () => undefined,
    oniceconnectionstatechange: () => undefined,
    close: () => events.push(["pc.close"]),
  };
  const stream = {
    getTracks: () => [
      { stop: () => events.push(["track.stop", 1]) },
      { stop: () => events.push(["track.stop", 2]) },
    ],
  };
  const audio = { remove: () => events.push(["audio.remove"]) };

  releaseRealtimeResources({ channel, connection, stream, audio });
  releaseRealtimeResources({ channel, connection, stream, audio });

  assert.equal(channel.onerror, null);
  assert.equal(channel.onclose, null);
  assert.equal(connection.onconnectionstatechange, null);
  assert.equal(connection.oniceconnectionstatechange, null);
  assert.equal(events.filter(([name]) => name === "track.stop").length, 2);
  assert.equal(events.filter(([name]) => name === "pc.close").length, 1);
  assert.equal(events.filter(([name]) => name === "channel.close").length, 1);
  assert.equal(events.filter(([name]) => name === "audio.remove").length, 1);
  assert.match(events.find(([name]) => name === "send")[1], /response\.cancel/);
});
