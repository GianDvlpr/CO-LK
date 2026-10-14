"use client";

import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Empty, List, Popover, Space, Spin, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getPusherClient } from "@/lib/pusher/client";
import { authorizedRealtimeChannels } from "@/lib/pusher/channels";
import type { Channel } from "pusher-js";

type NotificationItem = { id: string; type: string; title: string; message: string; readAt?: string; createdAt: string };
type NotificationsResponse = { items: NotificationItem[]; unreadCount: number };
type RealtimeEvent = { eventId: string; eventName: string; notification?: { title: string; message: string } | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

export function NotificationCenter({ companyId, permissions }: { companyId: string; permissions: string[] }) {
  const queryClient = useQueryClient();
  const seenEvents = useRef(new Set<string>());
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => api<NotificationsResponse>("/api/v1/notifications"), refetchInterval: 30_000 });
  const markRead = useMutation({ mutationFn: (id: string) => api(`/api/v1/notifications/${id}/read`, { method: "PATCH" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }) });
  const markAllRead = useMutation({ mutationFn: () => api("/api/v1/notifications/read-all", { method: "PATCH" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }) });

  useEffect(() => {
    let active = true;
    const processPending = async () => {
      if (document.hidden) return;
      const response = await fetch("/api/v1/notifications/process", { method: "POST" }).catch(() => null);
      if (active && response?.ok) await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    void processPending();
    const timer = window.setInterval(() => void processPending(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [queryClient]);

  useEffect(() => {
    const channels: Channel[] = [];
    try {
      const pusher = getPusherClient();
      const receive = (eventName: string, event: RealtimeEvent) => {
        if (eventName.startsWith("pusher:" ) || !event?.eventId || seenEvents.current.has(event.eventId)) return;
        seenEvents.current.add(event.eventId);
        if (seenEvents.current.size > 200) seenEvents.current.clear();
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        const domain = event.eventName.split(".")[0];
        const keys: Record<string, string[][]> = {
          purchase: [["purchases"], ["inventory"], ["kardex"]],
          inventory: [["inventory"], ["kardex"]],
          production: [["production"], ["inventory"], ["kardex"]],
          order: [["orders"], ["inventory"], ["kardex"]],
          product: [["products"]], recipe: [["recipes"]], import: [["imports"]], catalog: [["catalogs"]],
        };
        for (const key of keys[domain] ?? []) void queryClient.invalidateQueries({ queryKey: key });
        if (event.notification) toast.info(event.notification.title, { description: event.notification.message });
      };
      for (const name of authorizedRealtimeChannels(companyId, permissions)) {
        const channel = pusher.subscribe(name);
        channel.bind_global(receive);
        channels.push(channel);
      }
    } catch {
      channels.length = 0;
    }
    return () => { for (const channel of channels) getPusherClient().unsubscribe(channel.name); };
  }, [companyId, permissions, queryClient]);

  const content = <div className="notification-popover">
    <div className="notification-heading"><div><strong>Notificaciones</strong><Typography.Text type="secondary">Actividad operativa reciente</Typography.Text></div>{notifications.data?.unreadCount ? <Button type="text" size="small" icon={<CheckOutlined />} loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>Marcar todas</Button> : null}</div>
    {notifications.isLoading ? <div className="notification-loading"><Spin /></div> : notifications.data?.items.length ? <List dataSource={notifications.data.items} renderItem={(item) => <List.Item className={item.readAt ? "" : "notification-unread"} onClick={() => { if (!item.readAt) markRead.mutate(item.id); }}><List.Item.Meta title={<Space><span>{item.title}</span>{!item.readAt ? <Badge status="processing" /> : null}</Space>} description={<><div>{item.message}</div><small>{dayjs(item.createdAt).format("DD/MM/YYYY HH:mm")}</small></>} /></List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No hay notificaciones" />}
  </div>;

  return <Popover placement="bottomRight" trigger="click" content={content} arrow={false} classNames={{ root: "notification-overlay" }}><Badge count={notifications.data?.unreadCount ?? 0} overflowCount={99} size="small"><Button type="text" aria-label="Notificaciones" icon={<BellOutlined />} /></Badge></Popover>;
}
