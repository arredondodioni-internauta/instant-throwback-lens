import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ---------- HOST ----------

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(120),
        shotsPerGuest: z.number().int().min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Try a few codes in case of collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { data: ev, error } = await supabaseAdmin
        .from("events")
        .insert({
          host_id: userId,
          name: data.name,
          code,
          shots_per_guest: data.shotsPerGuest,
        })
        .select()
        .single();
      if (!error && ev) return ev;
      if (error && !error.message.includes("duplicate")) {
        throw new Error(error.message);
      }
    }
    throw new Error("Could not generate a unique event code");
  });

export const listMyEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("host_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getEventDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: ev, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", data.eventId)
      .eq("host_id", userId)
      .single();
    if (error || !ev) throw new Error("Event not found");

    const [{ count: guestCount }, { count: photoCount }] = await Promise.all([
      supabaseAdmin
        .from("guests")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id),
      supabaseAdmin
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id),
    ]);

    return {
      event: ev,
      guestCount: guestCount ?? 0,
      photoCount: photoCount ?? 0,
    };
  });

export const endEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("events")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.eventId)
      .eq("host_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEventPhotosForDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, host_id, name")
      .eq("id", data.eventId)
      .single();
    if (!ev || ev.host_id !== userId) throw new Error("Event not found");

    const { data: photos, error } = await supabaseAdmin
      .from("photos")
      .select("id, storage_path, taken_at, guest_id, guests(display_name)")
      .eq("event_id", data.eventId)
      .order("taken_at", { ascending: true });
    if (error) throw new Error(error.message);

    const items = await Promise.all(
      (photos ?? []).map(async (p: any) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("event-photos")
          .createSignedUrl(p.storage_path, 60 * 60);
        return {
          id: p.id,
          guestName: (p.guests?.display_name as string) ?? "guest",
          takenAt: p.taken_at,
          url: signed?.signedUrl ?? null,
        };
      }),
    );
    return { eventName: ev.name, photos: items.filter((i) => i.url) };
  });

// ---------- GUEST ----------

export const getEventByCode = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ code: z.string().min(4).max(12) }).parse(input),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase().trim();
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, name, status, shots_per_guest")
      .eq("code", code)
      .single();
    if (!ev) throw new Error("Event not found. Check the code.");
    return {
      id: ev.id,
      name: ev.name,
      status: ev.status as "active" | "ended",
      shotsPerGuest: ev.shots_per_guest as number,
    };
  });

export const joinEvent = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        code: z.string().min(4).max(12),
        displayName: z.string().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase().trim();
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, name, status, shots_per_guest")
      .eq("code", code)
      .single();
    if (!ev) throw new Error("Event not found. Check the code.");
    if (ev.status !== "active") throw new Error("This event has ended.");

    const { data: guest, error } = await supabaseAdmin
      .from("guests")
      .insert({ event_id: ev.id, display_name: data.displayName.trim() })
      .select("id, device_token")
      .single();
    if (error || !guest) throw new Error(error?.message ?? "Could not join");

    return {
      eventId: ev.id,
      eventName: ev.name,
      shotsPerGuest: ev.shots_per_guest,
      guestId: guest.id,
      deviceToken: guest.device_token,
    };
  });

export const getGuestStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ deviceToken: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: guest } = await supabaseAdmin
      .from("guests")
      .select("id, display_name, event_id, events(id, name, status, shots_per_guest)")
      .eq("device_token", data.deviceToken)
      .single();
    if (!guest) throw new Error("Guest not found");
    const event = guest.events as any;
    const { count } = await supabaseAdmin
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guest.id);
    return {
      guestId: guest.id,
      displayName: guest.display_name,
      eventId: event.id,
      eventName: event.name,
      eventStatus: event.status as "active" | "ended",
      shotsPerGuest: event.shots_per_guest as number,
      shotsTaken: count ?? 0,
    };
  });

export const takePhoto = createServerFn({ method: "POST" })
  .inputValidator((input) => {
    if (!(input instanceof FormData)) throw new Error("Expected FormData");
    const deviceToken = input.get("deviceToken")?.toString() ?? "";
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Missing file");
    if (!deviceToken) throw new Error("Missing deviceToken");
    return { deviceToken, file };
  })
  .handler(async ({ data }) => {
    const { data: guest } = await supabaseAdmin
      .from("guests")
      .select("id, event_id, events(id, status, shots_per_guest)")
      .eq("device_token", data.deviceToken)
      .single();
    if (!guest) throw new Error("Guest not found");
    const event = guest.events as any;
    if (event.status !== "active") throw new Error("Event has ended");

    const { count } = await supabaseAdmin
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guest.id);
    if ((count ?? 0) >= event.shots_per_guest) {
      throw new Error("No shots remaining");
    }

    const photoId = crypto.randomUUID();
    const path = `${event.id}/${guest.id}/${photoId}.jpg`;
    const arrayBuffer = await data.file.arrayBuffer();
    const { error: upErr } = await supabaseAdmin.storage
      .from("event-photos")
      .upload(path, arrayBuffer, {
        contentType: data.file.type || "image/jpeg",
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

    const { error: insErr } = await supabaseAdmin.from("photos").insert({
      id: photoId,
      event_id: event.id,
      guest_id: guest.id,
      storage_path: path,
    });
    if (insErr) throw new Error(insErr.message);

    return { shotsTaken: (count ?? 0) + 1, shotsPerGuest: event.shots_per_guest as number };
  });