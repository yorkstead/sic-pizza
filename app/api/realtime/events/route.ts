import { NextRequest } from "next/server";
import { getRealtimeEventBus, type RealtimeEnvelope } from "@/lib/server/realtime/event-bus";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";
import { authorizeGuestSession } from "@/lib/server/auth/guest-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const locationId = searchParams.get("locationId");
  const sinceSeqParam = searchParams.get("sinceSeq");
  const sinceSeq = sinceSeqParam ? parseInt(sinceSeqParam, 10) : 0;
  const queryToken = searchParams.get("token");
  const authHeader = req.headers.get("authorization") || (queryToken ? `Bearer ${queryToken}` : null);

  // Authorize as staff or guest
  let isStaff = false;
  let isGuest = false;
  let guestSessionId: string | undefined;

  const staffAuth = await authorizeStaffAction(req, "TABLE_VIEW");

  if (staffAuth.authorized) {
    isStaff = true;
  } else {
    const guestAuth = await authorizeGuestSession(authHeader);
    if (guestAuth.authorized && guestAuth.guest) {
      isGuest = true;
      guestSessionId = guestAuth.guest.sessionId;
    }
  }

  if (!isStaff && !isGuest) {
    return new Response(JSON.stringify({ error: "Unauthorized connection." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Scoping check: guests can ONLY listen to their own table session
  if (isGuest && sessionId && sessionId !== guestSessionId) {
    return new Response(JSON.stringify({ error: "Forbidden: Scoped to your assigned table only." }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  const targetSessionId = isGuest ? guestSessionId! : sessionId;
  const eventBus = getRealtimeEventBus();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (eventType: string, data: unknown) => {
        try {
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream might be closing
        }
      };

      // 1. Initial connection ack
      sendEvent("connected", {
        timestamp: new Date().toISOString(),
        role: isStaff ? "staff" : "guest",
        sessionId: targetSessionId,
        locationId
      });

      // 2. Replay missed events if client reconnected with sinceSeq
      if (targetSessionId && sinceSeq > 0) {
        const replay = eventBus.getMissedEvents(targetSessionId, sinceSeq);
        if (replay.requiresFullSync) {
          sendEvent("sync_required", {
            reason: "Sequence gap exceeds replay buffer.",
            currentSeq: replay.currentSeq
          });
        } else if (replay.events.length > 0) {
          for (const envelope of replay.events) {
            sendEvent("event", envelope);
          }
        }
      }

      // 3. Register live subscriber
      let unsubscribe: (() => void) | undefined;

      const subscriber = (envelope: RealtimeEnvelope) => {
        sendEvent("event", envelope);
      };

      if (targetSessionId) {
        unsubscribe = eventBus.subscribeSession(targetSessionId, subscriber);
      } else if (isStaff && locationId) {
        unsubscribe = eventBus.subscribeFloor(locationId, subscriber);
      }

      // 4. Heartbeat ping timer
      const heartbeatInterval = setInterval(() => {
        sendEvent("ping", { t: Date.now() });
      }, 15000);

      // 5. Cleanup on disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
