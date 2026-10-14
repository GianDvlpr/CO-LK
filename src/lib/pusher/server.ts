import Pusher from "pusher";

import { readServerEnv } from "@/lib/env/server";

let serverClient: Pusher | undefined;

export function getPusherServer() {
  const env = readServerEnv();

  if (!env.PUSHER_APP_ID || !env.PUSHER_KEY || !env.PUSHER_SECRET || !env.PUSHER_CLUSTER) {
    throw new Error("Pusher no está configurado para el servidor.");
  }

  serverClient ??= new Pusher({
    appId: env.PUSHER_APP_ID,
    key: env.PUSHER_KEY,
    secret: env.PUSHER_SECRET,
    cluster: env.PUSHER_CLUSTER,
    useTLS: true,
  });

  return serverClient;
}
