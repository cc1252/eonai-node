// vendor/official-exit/provider-node/official-exit.ts
import { connect, isIP } from "node:net";

// vendor/official-exit/shared/official-exit-binary.ts
var OFFICIAL_EXIT_BINARY_MAGIC = 1464812888;
var OFFICIAL_EXIT_BINARY_VERSION = 1;
var OFFICIAL_EXIT_BINARY_HEADER_BYTES = 16;
var OFFICIAL_EXIT_BINARY_MAX_SESSION_ID_BYTES = 128;
var OFFICIAL_EXIT_BINARY_MAX_PAYLOAD_BYTES = 64 * 1024;
var OFFICIAL_EXIT_BINARY_INITIAL_WINDOW_BYTES = 256 * 1024;
var OFFICIAL_EXIT_BULK_MIN_INITIAL_WINDOW_BYTES = 1024 * 1024;
var OFFICIAL_EXIT_BULK_MAX_INITIAL_WINDOW_BYTES = 4 * 1024 * 1024;
var OFFICIAL_EXIT_DEFAULT_CONNECTION_QUEUE_BUDGET_BYTES = 16 * 1024 * 1024;
var OFFICIAL_EXIT_WEBSOCKET_MAX_MESSAGE_BYTES = 1024 * 1024;
var DATA_OPCODE = 1;
var WINDOW_UPDATE_OPCODE = 2;
var MAX_WINDOW_UPDATE_BYTES = 16 * 1024 * 1024;
var OfficialExitBinaryFrameError = class extends Error {
  code = "official_exit_invalid_binary_frame";
  constructor(message) {
    super(message);
    this.name = "OfficialExitBinaryFrameError";
  }
};
function uint32(name, value) {
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
    throw new OfficialExitBinaryFrameError(`${name} must be a uint32`);
  }
  return value;
}
function sessionIdBytes(sessionId) {
  const encoded = Buffer.from(sessionId, "utf8");
  if (encoded.byteLength === 0 || encoded.byteLength > OFFICIAL_EXIT_BINARY_MAX_SESSION_ID_BYTES) {
    throw new OfficialExitBinaryFrameError("sessionId length is invalid");
  }
  if (encoded.toString("utf8") !== sessionId) {
    throw new OfficialExitBinaryFrameError("sessionId must be valid UTF-8");
  }
  return encoded;
}
function encodeFrame(opcode, sessionId, value, payload) {
  const session = sessionIdBytes(sessionId);
  const frame = Buffer.allocUnsafe(OFFICIAL_EXIT_BINARY_HEADER_BYTES + session.byteLength + payload.byteLength);
  frame.writeUInt32BE(OFFICIAL_EXIT_BINARY_MAGIC, 0);
  frame.writeUInt8(OFFICIAL_EXIT_BINARY_VERSION, 4);
  frame.writeUInt8(opcode, 5);
  frame.writeUInt16BE(session.byteLength, 6);
  frame.writeUInt32BE(uint32("frame value", value), 8);
  frame.writeUInt32BE(payload.byteLength, 12);
  session.copy(frame, OFFICIAL_EXIT_BINARY_HEADER_BYTES);
  payload.copy(frame, OFFICIAL_EXIT_BINARY_HEADER_BYTES + session.byteLength);
  return frame;
}
function encodeOfficialExitBinaryData(sessionId, seq, payload) {
  if (payload.byteLength === 0 || payload.byteLength > OFFICIAL_EXIT_BINARY_MAX_PAYLOAD_BYTES) {
    throw new OfficialExitBinaryFrameError("data payload length is invalid");
  }
  return encodeFrame(DATA_OPCODE, sessionId, seq, payload);
}
function encodeOfficialExitBinaryWindowUpdate(sessionId, creditBytes) {
  if (!Number.isInteger(creditBytes) || creditBytes <= 0 || creditBytes > MAX_WINDOW_UPDATE_BYTES) {
    throw new OfficialExitBinaryFrameError("creditBytes is invalid");
  }
  return encodeFrame(WINDOW_UPDATE_OPCODE, sessionId, creditBytes, Buffer.alloc(0));
}

// vendor/official-exit/shared/official-exit-vendors.ts
var OFFICIAL_EXIT_VENDOR_CONFIGS = Object.freeze([
  {
    id: "openai",
    displayName: "OpenAI / Codex",
    allowedHosts: ["*.openai.com", "*.chatgpt.com"]
  },
  {
    id: "anthropic",
    displayName: "Anthropic / Claude",
    allowedHosts: ["*.anthropic.com", "*.claude.com", "*.claude.ai"]
  },
  {
    id: "qwen",
    displayName: "Qwen",
    allowedHosts: ["*.aliyuncs.com"]
  },
  {
    id: "zhipu",
    displayName: "Zhipu AI",
    allowedHosts: ["*.bigmodel.cn", "*.z.ai"]
  },
  {
    id: "moonshot",
    displayName: "Moonshot / Kimi",
    allowedHosts: ["*.kimi.com", "*.moonshot.ai", "*.moonshot.cn"]
  },
  {
    id: "minimax",
    displayName: "MiniMax",
    allowedHosts: ["*.minimax.io", "*.minimaxi.com"]
  },
  {
    id: "xiaomi",
    displayName: "Xiaomi MiMo",
    allowedHosts: ["*.xiaomimimo.com"]
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    allowedHosts: ["*.deepseek.com"]
  },
  {
    id: "ollama",
    displayName: "Ollama Cloud",
    allowedHosts: ["ollama.com"]
  },
  {
    id: "google",
    displayName: "Google Gemini",
    allowedHosts: ["generativelanguage.googleapis.com"]
  },
  {
    id: "xai",
    displayName: "xAI",
    allowedHosts: ["*.x.ai", "*.grok.com"]
  },
  {
    id: "jimeng",
    displayName: "Jimeng / Dreamina",
    // Intentionally keep registrable-domain scope. Jimeng has changed API
    // endpoints before; narrowing these entries would force needless Node
    // rebuilds whenever another official subdomain is introduced. Completed
    // Image uploads apply through imagex under bytedanceapi.com, then send the
    // bytes to upload hosts returned by ImageX under snssdk.com or
    // bytedancevod.com;
    // completed videos use signed vlabvod.com URLs during query_result downloads;
    // Image 4.0 results use signed byteimg.com URLs.
    allowedHosts: ["*.byteimg.com", "*.byted.org", "*.bytedanceapi.com", "*.jianying.com", "*.vlabvod.com", "*.snssdk.com", "*.bytedancevod.com"]
  },
  {
    id: "cursor",
    displayName: "Cursor Desktop",
    // Keep the default narrow: Cursor dashboard RPCs and Agent streaming use
    // fixed hosts, while Grok Bot sandbox descriptors resolve gateway and VNC
    // traffic to dynamic hosts under cursorvm.com.
    allowedHosts: ["api2.cursor.sh", "agentn.api5.cursor.sh", "*.cursorvm.com"]
  },
  {
    id: "volcengine",
    displayName: "Volcengine Ark",
    // Two different registrable domains, both required: inference goes to the
    // data plane, while Coding Plan quota can only be read from the control
    // plane with an AccessKey pair (the inference key is rejected there).
    // Kept as exact hosts rather than a domain pattern: Ark serves
    // pay-as-you-go billing from a sibling path on the same origin, and the
    // Platform already hard-asserts this host on the way out — a wider entry
    // here would only remove a check without enabling anything we use.
    allowedHosts: ["ark.cn-beijing.volces.com", "open.volcengineapi.com"]
  },
  {
    id: "opencode",
    displayName: "OpenCode Go",
    // Exact host, no wildcard: the Go subscription lives under one origin and
    // the Platform hard-asserts the /zen/go/ path prefix on the way out (the
    // same key on /zen/v1/ silently bills per token). A domain pattern here
    // would drop a check without enabling anything the Platform dials.
    allowedHosts: ["opencode.ai"]
  }
]);
var DEFAULT_OFFICIAL_EXIT_ALLOWED_HOSTS = Object.freeze([
  ...new Set(OFFICIAL_EXIT_VENDOR_CONFIGS.flatMap((vendor) => vendor.allowedHosts))
]);

// vendor/official-exit/provider-node/official-exit.ts
var OFFICIAL_EXIT_ALLOWLIST_ENV = "PROVIDER_OFFICIAL_EXIT_ALLOWED_HOSTS";
var OFFICIAL_EXIT_EARLY_DATA_MAX_BYTES = 64 * 1024;
var OFFICIAL_EXIT_PERSISTENT_TRANSPORT_INACTIVITY_TIMEOUT_MS = 186e4;
var OFFICIAL_EXIT_LEGACY_PLATFORM_OPEN_TIMEOUT_MS = 15e3;
var OFFICIAL_EXIT_OPEN_RESPONSE_MARGIN_MS = 3e3;
var OFFICIAL_EXIT_ADDRESS_ATTEMPT_TIMEOUT_MS = 2e3;
var OFFICIAL_EXIT_MIN_ADDRESS_ATTEMPT_TIMEOUT_MS = 250;
function parseOfficialExitAllowlist(raw) {
  if (!raw?.trim()) return [...DEFAULT_OFFICIAL_EXIT_ALLOWED_HOSTS];
  const entries = raw.split(",").map((host) => normalizeOfficialExitHostPattern(host)).filter(Boolean);
  return entries.length ? entries : [...DEFAULT_OFFICIAL_EXIT_ALLOWED_HOSTS];
}
function isOfficialExitHostAllowed(host, allowlist) {
  const target = host.trim().toLowerCase().replace(/\.$/, "");
  if (!target) return false;
  return allowlist.some((entry) => matchHostPattern(target, entry));
}
function matchHostPattern(host, entry) {
  const normalized = normalizeOfficialExitHostPattern(entry);
  const domain = normalized.startsWith("*.") ? normalized.slice(2) : normalized.startsWith(".") ? normalized.slice(1) : "";
  if (domain) return host === domain || host.endsWith(`.${domain}`);
  return host === normalized;
}
function normalizeOfficialExitHostPattern(value) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}
var ProviderOfficialExitTunnelManager = class {
  constructor(getConfig, send, allowedHosts = parseOfficialExitAllowlist(process.env[OFFICIAL_EXIT_ALLOWLIST_ENV]), options = {}) {
    this.getConfig = getConfig;
    this.send = send;
    this.allowedHosts = allowedHosts;
    this.options = {
      backpressureTimeoutMs: options.backpressureTimeoutMs ?? 3e4,
      setPlatformInputBackpressure: options.setPlatformInputBackpressure
    };
  }
  getConfig;
  send;
  sessions = /* @__PURE__ */ new Map();
  allowedHosts;
  negotiatedDataProtocol = "json_base64_v1";
  negotiatedEarlyDataProtocol;
  negotiatedBulkInitialWindowBytes;
  acceptingSessions = true;
  options;
  activeSessionCount() {
    return this.sessions.size;
  }
  requestScopedSessionCount() {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.lifecycleProtocol === "request_v1") count += 1;
    }
    return count;
  }
  setNegotiatedDataProtocol(dataProtocol) {
    this.negotiatedDataProtocol = dataProtocol;
  }
  setNegotiatedEarlyDataProtocol(earlyDataProtocol) {
    this.negotiatedEarlyDataProtocol = earlyDataProtocol;
  }
  setNegotiatedBulkTransfer(bulkTransfer) {
    this.negotiatedBulkInitialWindowBytes = bulkTransfer?.bulkInitialWindowBytes;
  }
  setAcceptingSessions(accepting) {
    this.acceptingSessions = accepting;
  }
  closeAll(reasonCode = "provider_node_stopped") {
    for (const [sessionId, session] of this.sessions.entries()) {
      this.closeSession(sessionId, session, reasonCode, false);
    }
  }
  async handleMessage(message, wireBytes) {
    if (message.type === "official_exit.open") {
      await this.open(message);
      return;
    }
    if (message.type === "official_exit.data") {
      this.writeJsonData(message, wireBytes);
      return;
    }
    this.closeFromPlatform(message);
  }
  handleBinaryFrame(frame, wireBytes) {
    if (frame.kind === "data") {
      this.writeBinaryData(frame, wireBytes);
      return;
    }
    const session = this.sessions.get(frame.sessionId);
    if (!session || session.closed || session.dataProtocol !== "binary_v1") return;
    session.webSocketBytesIn += wireBytes;
    session.outboundCredit += frame.creditBytes;
    if (session.outboundCredit > 16 * 1024 * 1024) {
      this.sendErrorAndClose(frame.sessionId, session, "official_exit_invalid_window_update");
      return;
    }
    this.pumpUpstreamToPlatform(frame.sessionId, session);
  }
  async open(request) {
    const config = this.getConfig();
    const rejection = this.validateOpenRequest(request, config);
    if (rejection) {
      this.sendOpenResponse(request.sessionId, false, rejection);
      return;
    }
    await new Promise((resolve) => {
      const connectStartedAt = Date.now();
      const connectTimeoutMs = officialExitConnectTimeoutMs(request.deadlineMs, request.openTimeoutMs);
      const socket = connect({
        host: request.targetHost,
        port: request.targetPort,
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: officialExitAddressAttemptTimeoutMs(connectTimeoutMs)
      });
      const lifecycleProtocol = request.lifecycleProtocol ?? "request_v1";
      const persistent = lifecycleProtocol === "persistent_tunnel_v1";
      const session = {
        socket,
        seqOut: 0,
        bytesIn: 0,
        bytesOut: 0,
        platformPayloadBytes: 0,
        closed: false,
        connected: false,
        maxBytesIn: persistent ? void 0 : request.maxBytesIn,
        maxBytesOut: persistent ? void 0 : request.maxBytesOut,
        lifecycleProtocol,
        connectedAt: connectStartedAt,
        connectMs: 0,
        connectTimeoutMs,
        connectAttempts: 0,
        dataProtocol: request.dataProtocol ?? "json_base64_v1",
        earlyDataProtocol: request.earlyDataProtocol,
        trafficClass: request.trafficClass ?? "interactive",
        initialWindowBytes: request.initialWindowBytes ?? OFFICIAL_EXIT_BINARY_INITIAL_WINDOW_BYTES,
        earlyDataBytes: 0,
        pendingToUpstream: [],
        pendingToUpstreamBytes: 0,
        expectedSeqIn: 0,
        outboundCredit: request.initialWindowBytes ?? OFFICIAL_EXIT_BINARY_INITIAL_WINDOW_BYTES,
        pendingFromUpstream: [],
        pendingFromUpstreamOffset: 0,
        upstreamClosed: false,
        webSocketBytesIn: 0,
        webSocketBytesOut: 0,
        backpressureCount: 0,
        peakBufferedBytes: 0,
        platformInputBlocked: false
      };
      this.sessions.set(request.sessionId, session);
      let settled = false;
      const failBeforeConnect = (reasonCode) => {
        if (settled) return;
        settled = true;
        session.closed = true;
        this.sessions.delete(request.sessionId);
        socket.destroy();
        this.sendOpenResponse(request.sessionId, false, reasonCode, {
          version: 1,
          stage: "connect",
          outcome: "failed",
          reasonCode,
          addressFamily: session.addressFamily,
          remoteAddress: session.remoteAddress,
          connectMs: Date.now() - connectStartedAt,
          ...connectPhaseDiagnostic(session),
          bytesToUpstream: 0,
          earlyDataBytes: session.earlyDataBytes,
          webSocketBytesFromPlatform: session.webSocketBytesIn
        });
        resolve();
      };
      socket.setTimeout(session.connectTimeoutMs);
      if (isIP(request.targetHost)) {
        session.dnsMs = 0;
        session.resolvedAddressCount = 1;
      }
      socket.on("lookup", (error, address, family) => {
        if (settled) return;
        session.dnsMs ??= Date.now() - connectStartedAt;
        if (error) return;
        session.resolvedAddressCount = (session.resolvedAddressCount ?? 0) + 1;
        if (session.connectAttempts === 0) recordAttemptAddress(session, address, family);
      });
      socket.on("connectionAttempt", (address, _port, family) => {
        if (settled) return;
        session.connectAttempts += 1;
        recordAttemptAddress(session, address, family);
      });
      socket.once("connect", () => {
        if (settled) return;
        if (session.closed || this.sessions.get(request.sessionId) !== session) {
          settled = true;
          socket.destroy();
          resolve();
          return;
        }
        settled = true;
        socket.setTimeout(persistent ? OFFICIAL_EXIT_PERSISTENT_TRANSPORT_INACTIVITY_TIMEOUT_MS : officialExitSocketIdleTimeoutMs(request.deadlineMs, request.socketIdleTimeoutMs));
        const addressFamily = socket.remoteFamily === "IPv4" ? "ipv4" : socket.remoteFamily === "IPv6" ? "ipv6" : void 0;
        const connectMs = Date.now() - connectStartedAt;
        session.connected = true;
        session.connectedAt = Date.now();
        session.connectMs = connectMs;
        if (session.dnsMs !== void 0) session.tcpConnectMs = Math.max(0, connectMs - session.dnsMs);
        session.addressFamily = addressFamily;
        session.remoteAddress = socket.remoteAddress;
        this.attachSocketHandlers(request.sessionId, session);
        this.flushPendingToUpstream(request.sessionId, session);
        if (session.closed) {
          resolve();
          return;
        }
        this.sendOpenResponse(request.sessionId, true, void 0, this.transportDiagnostic(session, "connected"));
        resolve();
      });
      socket.once("error", (error) => {
        if (!settled) {
          failBeforeConnect(classifyConnectError(error));
          return;
        }
        const session2 = this.sessions.get(request.sessionId);
        if (session2) this.sendErrorAndClose(request.sessionId, session2, classifySocketError(error), error.message);
      });
      socket.once("timeout", () => {
        if (!settled) {
          failBeforeConnect("official_exit_connect_timeout");
          return;
        }
        const session2 = this.sessions.get(request.sessionId);
        if (session2) this.sendErrorAndClose(request.sessionId, session2, "official_exit_socket_timeout");
      });
      socket.once("close", () => {
        if (settled) return;
        settled = true;
        this.sessions.delete(request.sessionId);
        resolve();
      });
    });
  }
  validateOpenRequest(request, config) {
    if (!this.acceptingSessions) return "official_exit_node_draining";
    if (!config.officialExit?.enabled) return "official_exit_disabled";
    if (request.routeMode !== "official_exit") return "official_exit_route_mode_required";
    if (request.providerId !== config.providerId || request.nodeId !== config.nodeId) return "official_exit_identity_mismatch";
    if (!request.targetHost || /[\s/]/.test(request.targetHost)) return "official_exit_invalid_target_host";
    if (!Number.isInteger(request.targetPort) || request.targetPort <= 0 || request.targetPort > 65535) {
      return "official_exit_invalid_target_port";
    }
    if (!isOfficialExitHostAllowed(request.targetHost, this.allowedHosts)) return "official_exit_vendor_not_allowed";
    if (this.sessions.has(request.sessionId)) return "official_exit_duplicate_session";
    const requestedDataProtocol = request.dataProtocol ?? "json_base64_v1";
    if (requestedDataProtocol !== this.negotiatedDataProtocol) return "official_exit_data_protocol_not_negotiated";
    if (request.earlyDataProtocol !== void 0 && request.earlyDataProtocol !== this.negotiatedEarlyDataProtocol) {
      return "official_exit_early_data_protocol_not_negotiated";
    }
    const lifecycleProtocol = request.lifecycleProtocol ?? "request_v1";
    if (lifecycleProtocol !== "request_v1" && lifecycleProtocol !== "persistent_tunnel_v1") {
      return "official_exit_lifecycle_protocol_invalid";
    }
    if (lifecycleProtocol === "persistent_tunnel_v1" && (requestedDataProtocol !== "binary_v1" || request.earlyDataProtocol !== "buffered_v1")) {
      return "official_exit_persistent_transport_required";
    }
    const trafficClass = request.trafficClass ?? "interactive";
    if (trafficClass !== "interactive" && trafficClass !== "bulk") {
      return "official_exit_traffic_class_invalid";
    }
    const expectedInitialWindowBytes = trafficClass === "bulk" ? this.negotiatedBulkInitialWindowBytes ?? OFFICIAL_EXIT_BINARY_INITIAL_WINDOW_BYTES : OFFICIAL_EXIT_BINARY_INITIAL_WINDOW_BYTES;
    const requestedInitialWindowBytes = request.initialWindowBytes ?? OFFICIAL_EXIT_BINARY_INITIAL_WINDOW_BYTES;
    if (!expectedInitialWindowBytes || !Number.isSafeInteger(requestedInitialWindowBytes) || requestedInitialWindowBytes !== expectedInitialWindowBytes || requestedInitialWindowBytes < OFFICIAL_EXIT_BINARY_INITIAL_WINDOW_BYTES || requestedInitialWindowBytes > OFFICIAL_EXIT_BULK_MAX_INITIAL_WINDOW_BYTES || trafficClass === "bulk" && this.negotiatedBulkInitialWindowBytes !== void 0 && requestedInitialWindowBytes < OFFICIAL_EXIT_BULK_MIN_INITIAL_WINDOW_BYTES) {
      return "official_exit_initial_window_not_negotiated";
    }
    return void 0;
  }
  attachSocketHandlers(sessionId, session) {
    session.socket.on("data", (chunk) => {
      if (session.closed) return;
      session.bytesIn += Buffer.byteLength(chunk);
      if (session.maxBytesIn !== void 0 && session.bytesIn > session.maxBytesIn) {
        this.sendErrorAndClose(sessionId, session, "official_exit_max_bytes_in_exceeded");
        return;
      }
      if (session.dataProtocol === "binary_v1") {
        session.pendingFromUpstream.push(Buffer.from(chunk));
        session.socket.pause();
        this.pumpUpstreamToPlatform(sessionId, session);
        return;
      }
      const frame = {
        type: "official_exit.data",
        sessionId,
        seq: session.seqOut,
        payloadBase64: Buffer.from(chunk).toString("base64")
      };
      const encodedBytes = Buffer.byteLength(JSON.stringify(frame));
      session.webSocketBytesOut += encodedBytes;
      session.seqOut += 1;
      this.sendSessionFrame(sessionId, session, frame, session.trafficClass);
    });
    session.socket.once("close", () => {
      if (this.sessions.get(sessionId) !== session) return;
      if (session.dataProtocol === "binary_v1" && session.pendingFromUpstream.length > 0) {
        session.upstreamClosed = true;
        this.clearUpstreamDrain(session);
        return;
      }
      this.closeSession(sessionId, session, "official_exit_remote_closed", true);
    });
  }
  writeJsonData(frame, wireBytes) {
    const session = this.sessions.get(frame.sessionId);
    if (!session || session.closed) {
      this.sendControl({
        type: "official_exit.error",
        sessionId: frame.sessionId,
        errorCode: "official_exit_session_not_found",
        retryable: true
      });
      return;
    }
    if (session.dataProtocol !== "json_base64_v1" || frame.seq !== session.expectedSeqIn) {
      this.sendErrorAndClose(frame.sessionId, session, "official_exit_frame_sequence_mismatch");
      return;
    }
    session.expectedSeqIn += 1;
    const chunk = Buffer.from(frame.payloadBase64, "base64");
    session.webSocketBytesIn += wireBytes ?? Buffer.byteLength(JSON.stringify(frame));
    session.platformPayloadBytes += chunk.byteLength;
    if (session.maxBytesOut !== void 0 && session.platformPayloadBytes > session.maxBytesOut) {
      this.sendErrorAndClose(frame.sessionId, session, "official_exit_max_bytes_out_exceeded");
      return;
    }
    if (!session.connected) {
      this.queueEarlyData(frame.sessionId, session, chunk, 0);
      return;
    }
    this.writeToUpstream(frame.sessionId, session, chunk, 0);
  }
  writeBinaryData(frame, wireBytes) {
    const session = this.sessions.get(frame.sessionId);
    if (!session || session.closed) {
      this.sendControl({
        type: "official_exit.error",
        sessionId: frame.sessionId,
        errorCode: "official_exit_session_not_found",
        retryable: true
      });
      return;
    }
    if (session.dataProtocol !== "binary_v1" || frame.seq !== session.expectedSeqIn) {
      this.sendErrorAndClose(frame.sessionId, session, "official_exit_frame_sequence_mismatch");
      return;
    }
    session.expectedSeqIn += 1;
    session.webSocketBytesIn += wireBytes;
    session.platformPayloadBytes += frame.payload.byteLength;
    if (session.maxBytesOut !== void 0 && session.platformPayloadBytes > session.maxBytesOut) {
      this.sendErrorAndClose(frame.sessionId, session, "official_exit_max_bytes_out_exceeded");
      return;
    }
    if (!session.connected) {
      this.queueEarlyData(frame.sessionId, session, frame.payload, frame.payload.byteLength);
      return;
    }
    this.writeToUpstream(frame.sessionId, session, frame.payload, frame.payload.byteLength);
  }
  queueEarlyData(sessionId, session, payload, creditBytes) {
    if (session.earlyDataProtocol !== "buffered_v1") {
      this.sendErrorAndClose(sessionId, session, "official_exit_early_data_not_negotiated");
      return;
    }
    if (session.pendingToUpstreamBytes + payload.byteLength > OFFICIAL_EXIT_EARLY_DATA_MAX_BYTES) {
      this.sendErrorAndClose(sessionId, session, "official_exit_early_data_exceeded");
      return;
    }
    session.pendingToUpstream.push({ payload: Buffer.from(payload), creditBytes });
    session.pendingToUpstreamBytes += payload.byteLength;
    session.earlyDataBytes += payload.byteLength;
  }
  flushPendingToUpstream(sessionId, session) {
    const pending = session.pendingToUpstream;
    session.pendingToUpstream = [];
    session.pendingToUpstreamBytes = 0;
    for (const item of pending) {
      if (session.closed) return;
      this.writeToUpstream(sessionId, session, item.payload, item.creditBytes);
    }
  }
  writeToUpstream(sessionId, session, payload, creditBytes) {
    if (session.upstreamClosed) return;
    session.bytesOut += payload.byteLength;
    const writable = session.socket.write(payload, () => {
      if (session.closed) return;
      if (creditBytes <= 0) return;
      const update = encodeOfficialExitBinaryWindowUpdate(sessionId, creditBytes);
      session.webSocketBytesOut += update.byteLength;
      this.sendSessionFrame(sessionId, session, update, "window");
    });
    if (!writable) {
      if (creditBytes <= 0) {
        this.blockPlatformInput(sessionId, session);
        return;
      }
      session.backpressureCount += 1;
      this.startPlatformInputBackpressureTimeout(sessionId, session);
      this.armUpstreamDrain(sessionId, session);
    }
  }
  pumpUpstreamToPlatform(sessionId, session) {
    if (session.closed || session.dataProtocol !== "binary_v1") return;
    while (session.outboundCredit > 0 && session.pendingFromUpstream.length > 0) {
      const pending = session.pendingFromUpstream[0];
      if (!pending) break;
      const remaining = pending.byteLength - session.pendingFromUpstreamOffset;
      const payloadBytes = Math.min(
        remaining,
        session.outboundCredit,
        OFFICIAL_EXIT_BINARY_MAX_PAYLOAD_BYTES
      );
      const payload = pending.subarray(
        session.pendingFromUpstreamOffset,
        session.pendingFromUpstreamOffset + payloadBytes
      );
      const encoded = encodeOfficialExitBinaryData(sessionId, session.seqOut, payload);
      session.seqOut += 1;
      session.outboundCredit -= payload.byteLength;
      session.webSocketBytesOut += encoded.byteLength;
      session.pendingFromUpstreamOffset += payload.byteLength;
      if (session.pendingFromUpstreamOffset >= pending.byteLength) {
        session.pendingFromUpstream.shift();
        session.pendingFromUpstreamOffset = 0;
      }
      if (!this.sendSessionFrame(sessionId, session, encoded, session.trafficClass)) return;
    }
    if (session.upstreamClosed && session.pendingFromUpstream.length === 0) {
      this.closeSession(sessionId, session, "official_exit_remote_closed", true);
    } else if (session.pendingFromUpstream.length === 0 && session.outboundCredit > 0) {
      this.clearUpstreamBackpressureTimeout(session);
      session.socket.resume();
    } else {
      this.startUpstreamBackpressureTimeout(sessionId, session);
    }
  }
  sendControl(message) {
    this.send(message, { lane: "control" });
  }
  sendSessionFrame(sessionId, session, message, lane) {
    const result = this.send(message, {
      lane,
      sessionId,
      onComplete: (error) => {
        if (error) {
          if (this.sessions.get(sessionId) === session && !session.closed) {
            this.sendErrorAndClose(sessionId, session, providerWebSocketSendErrorCode(error), error.message);
          }
          return;
        }
        if (session.dataProtocol === "json_base64_v1" && this.sessions.get(sessionId) === session && !session.closed) {
          session.socket.resume();
        }
      }
    });
    if (!result || typeof result !== "object" || typeof result.accepted !== "boolean") return true;
    session.peakBufferedBytes = Math.max(session.peakBufferedBytes, result.bufferedBytes ?? 0);
    if (result.backpressured) {
      session.backpressureCount += 1;
      if (session.dataProtocol === "json_base64_v1") session.socket.pause();
    }
    if (result.accepted) return true;
    if (!session.closed) {
      const error = result.error ?? new Error("provider_websocket_queue_overflow");
      this.sendErrorAndClose(sessionId, session, providerWebSocketSendErrorCode(error), error.message);
    }
    return false;
  }
  blockPlatformInput(sessionId, session) {
    if (session.platformInputBlocked) return;
    session.platformInputBlocked = true;
    session.backpressureCount += 1;
    this.options.setPlatformInputBackpressure?.(sessionId, true);
    this.startPlatformInputBackpressureTimeout(sessionId, session);
    this.armUpstreamDrain(sessionId, session);
  }
  armUpstreamDrain(sessionId, session) {
    if (session.closed || session.upstreamDrainHandler) return;
    const handler = () => {
      if (session.upstreamDrainHandler !== handler) return;
      session.upstreamDrainHandler = void 0;
      if (session.closed) return;
      this.clearPlatformInputBackpressureTimeout(session);
      if (session.platformInputBlocked) {
        session.platformInputBlocked = false;
        this.options.setPlatformInputBackpressure?.(sessionId, false);
      }
    };
    session.upstreamDrainHandler = handler;
    session.socket.once("drain", handler);
  }
  clearUpstreamDrain(session) {
    const handler = session.upstreamDrainHandler;
    if (!handler) return;
    session.upstreamDrainHandler = void 0;
    session.socket.off("drain", handler);
  }
  startUpstreamBackpressureTimeout(sessionId, session) {
    if (session.upstreamBackpressureTimer || session.closed) return;
    session.upstreamBackpressureTimer = setTimeout(() => {
      session.upstreamBackpressureTimer = void 0;
      this.sendErrorAndClose(sessionId, session, "official_exit_backpressure_timeout");
    }, this.options.backpressureTimeoutMs);
    session.upstreamBackpressureTimer.unref?.();
  }
  clearUpstreamBackpressureTimeout(session) {
    if (session.upstreamBackpressureTimer) clearTimeout(session.upstreamBackpressureTimer);
    session.upstreamBackpressureTimer = void 0;
  }
  startPlatformInputBackpressureTimeout(sessionId, session) {
    if (session.platformInputBackpressureTimer || session.closed) return;
    session.platformInputBackpressureTimer = setTimeout(() => {
      session.platformInputBackpressureTimer = void 0;
      this.sendErrorAndClose(sessionId, session, "official_exit_backpressure_timeout");
    }, this.options.backpressureTimeoutMs);
    session.platformInputBackpressureTimer.unref?.();
  }
  clearPlatformInputBackpressureTimeout(session) {
    if (session.platformInputBackpressureTimer) clearTimeout(session.platformInputBackpressureTimer);
    session.platformInputBackpressureTimer = void 0;
  }
  closeFromPlatform(message) {
    const session = this.sessions.get(message.sessionId);
    if (!session) return;
    this.closeSession(message.sessionId, session, message.reasonCode ?? "official_exit_platform_closed", false);
  }
  sendOpenResponse(sessionId, accepted, reasonCode, transportDiagnostic) {
    this.sendControl({
      type: "official_exit.open_response",
      sessionId,
      accepted,
      reasonCode,
      transportDiagnostic
    });
  }
  sendErrorAndClose(sessionId, session, errorCode, errorMessage) {
    this.sendControl({
      type: "official_exit.error",
      sessionId,
      errorCode,
      errorMessage,
      retryable: errorCode !== "official_exit_vendor_not_allowed",
      transportDiagnostic: this.transportDiagnostic(session, "failed", errorCode)
    });
    this.closeSession(sessionId, session, errorCode, true);
  }
  closeSession(sessionId, session, reasonCode, notifyPlatform) {
    if (session.closed) return;
    session.closed = true;
    this.clearUpstreamDrain(session);
    this.clearUpstreamBackpressureTimeout(session);
    this.clearPlatformInputBackpressureTimeout(session);
    if (session.platformInputBlocked) {
      this.options.setPlatformInputBackpressure?.(sessionId, false);
    }
    this.sessions.delete(sessionId);
    session.socket.destroy();
    if (!notifyPlatform) return;
    const close = {
      type: "official_exit.close",
      sessionId,
      reasonCode,
      transportDiagnostic: this.transportDiagnostic(session, "closed", reasonCode)
    };
    if (reasonCode !== "official_exit_remote_closed") {
      this.sendControl(close);
      return;
    }
    const result = this.send(close, { lane: session.trafficClass, sessionId });
    if (result && typeof result === "object" && result.accepted === false) this.sendControl(close);
  }
  transportDiagnostic(session, outcome, reasonCode) {
    return {
      version: 1,
      stage: "socket",
      outcome,
      reasonCode,
      addressFamily: session.addressFamily,
      remoteAddress: session.remoteAddress,
      connectMs: session.connectMs,
      ...connectPhaseDiagnostic(session),
      elapsedMs: Date.now() - session.connectedAt,
      bytesFromUpstream: session.bytesIn,
      bytesToUpstream: session.bytesOut,
      dataProtocol: session.dataProtocol,
      webSocketBytesFromPlatform: session.webSocketBytesIn,
      webSocketBytesToPlatform: session.webSocketBytesOut,
      backpressureCount: session.backpressureCount,
      peakBufferedBytes: session.peakBufferedBytes,
      earlyDataBytes: session.earlyDataBytes,
      lifecycleProtocol: session.lifecycleProtocol
    };
  }
};
function recordAttemptAddress(session, address, family) {
  session.remoteAddress = address;
  session.addressFamily = family === 4 || family === "IPv4" ? "ipv4" : family === 6 || family === "IPv6" ? "ipv6" : void 0;
}
function connectPhaseDiagnostic(session) {
  return {
    dnsMs: session.dnsMs,
    tcpConnectMs: session.tcpConnectMs,
    resolvedAddressCount: session.resolvedAddressCount,
    connectAttempts: session.connectAttempts || void 0,
    connectTimeoutMs: session.connectTimeoutMs
  };
}
function officialExitConnectTimeoutMs(deadlineMs, openTimeoutMs) {
  const deadline = positiveFiniteMs(deadlineMs) ?? 1e3;
  const platformWaitMs = Math.min(
    deadline,
    positiveFiniteMs(openTimeoutMs) ?? OFFICIAL_EXIT_LEGACY_PLATFORM_OPEN_TIMEOUT_MS
  );
  const marginMs = Math.min(
    OFFICIAL_EXIT_OPEN_RESPONSE_MARGIN_MS,
    Math.max(1, Math.floor(platformWaitMs * 0.2))
  );
  return Math.max(1, platformWaitMs - marginMs);
}
function officialExitAddressAttemptTimeoutMs(connectTimeoutMs) {
  return Math.min(
    OFFICIAL_EXIT_ADDRESS_ATTEMPT_TIMEOUT_MS,
    Math.max(OFFICIAL_EXIT_MIN_ADDRESS_ATTEMPT_TIMEOUT_MS, Math.floor(connectTimeoutMs / 3))
  );
}
function positiveFiniteMs(value) {
  return value !== void 0 && Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : void 0;
}
function officialExitSocketIdleTimeoutMs(deadlineMs, socketIdleTimeoutMs) {
  const fallbackMs = Number.isFinite(deadlineMs) && deadlineMs > 0 ? Math.floor(deadlineMs) : 1e3;
  const requestedMs = Number.isFinite(socketIdleTimeoutMs) && socketIdleTimeoutMs !== void 0 && socketIdleTimeoutMs > 0 ? Math.floor(socketIdleTimeoutMs) : fallbackMs;
  return Math.max(1e3, requestedMs);
}
function classifyConnectError(error) {
  const attempts = Array.isArray(error.errors) ? error.errors : [error];
  const codes = new Set(attempts.map((attempt) => attempt?.code));
  if (codes.has("ENOTFOUND") || codes.has("EAI_AGAIN")) return "official_exit_dns_failed";
  if (codes.has("ECONNREFUSED")) return "official_exit_connect_refused";
  if (codes.has("ETIMEDOUT")) return "official_exit_connect_timeout";
  return "official_exit_connect_failed";
}
function classifySocketError(error) {
  const code = error.code;
  if (code === "ETIMEDOUT") return "official_exit_socket_timeout";
  if (code === "ECONNRESET") return "official_exit_socket_reset";
  if (code === "EPIPE") return "official_exit_socket_broken_pipe";
  return "official_exit_socket_failed";
}
function providerWebSocketSendErrorCode(error) {
  if (error.message.includes("send_timeout")) return "official_exit_backpressure_timeout";
  if (error.message.includes("queue_overflow")) return "official_exit_connection_queue_overflow";
  if (error.message.includes("disconnected")) return "official_exit_provider_connection_closed";
  return "official_exit_websocket_send_failed";
}
export {
  DEFAULT_OFFICIAL_EXIT_ALLOWED_HOSTS,
  OFFICIAL_EXIT_ALLOWLIST_ENV,
  OFFICIAL_EXIT_EARLY_DATA_MAX_BYTES,
  OFFICIAL_EXIT_PERSISTENT_TRANSPORT_INACTIVITY_TIMEOUT_MS,
  OFFICIAL_EXIT_VENDOR_CONFIGS,
  ProviderOfficialExitTunnelManager,
  classifyConnectError,
  classifySocketError,
  isOfficialExitHostAllowed,
  officialExitAddressAttemptTimeoutMs,
  officialExitConnectTimeoutMs,
  officialExitSocketIdleTimeoutMs,
  parseOfficialExitAllowlist
};
