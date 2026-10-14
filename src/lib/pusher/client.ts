import PusherClient from "pusher-js";

let browserClient: PusherClient | undefined;

export function getPusherClient() {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    throw new Error("Pusher no está configurado para el navegador.");
  }

  browserClient ??= new PusherClient(key, {
    cluster,
    channelAuthorization: {
      endpoint: "/api/v1/pusher/auth",
      transport: "ajax",
    },
  });

  return browserClient;
}
