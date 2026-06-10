import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMOJIS = ["😂", "🥹", "🔥", "👏"] as const;
const codeSchema = z.string().min(4).max(12).transform((s) => s.toUpperCase().trim());
const uuidSchema = z.string().uuid();

async function loadPublishedEvent(code: string) {
  const { data: ev } = await supabaseAdmin
    .from("events")
    .select("id, name, code, album_published_at, album_expires_at")
    .eq("code", code)
    .single();
  if (!ev) throw new Error("Álbum no encontrado");
  if (!ev.album_published_at) throw new Error("El álbum aún no está disponible");
  if (ev.album_expires_at && new Date(ev.album_expires_at) < new Date()) {
    throw new Error("Este álbum ya no está disponible");
  }
  return ev;
}

// ---------- HOST ----------

export const publishAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: uuidSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const now = new Date();
    const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const { data: ev, error } = await supabaseAdmin
      .from("events")
      .update({
        status: "ended",
        ended_at: now.toISOString(),
        album_published_at: now.toISOString(),
        album_expires_at: expires.toISOString(),
      })
      .eq("id", data.eventId)
      .eq("host_id", userId)
      .select("id, code, name")
      .single();
    if (error || !ev) throw new Error(error?.message ?? "No se pudo publicar el álbum");

    // Fire push notifications (best-effort, don't fail publish if push fails)
    try {
      const { sendAlbumPublishedPush } = await import("./push.server");
      await sendAlbumPublishedPush(ev.id, ev.name, ev.code);
    } catch (e) {
      console.error("Push fan-out failed:", e);
    }

    return { ok: true, code: ev.code };
  });

// ---------- GUEST / VIEWER ----------

export const getAlbum = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      code: codeSchema,
      viewerToken: uuidSchema.optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ev = await loadPublishedEvent(data.code);

    const { data: photos, error } = await supabaseAdmin
      .from("photos")
      .select("id, taken_at, storage_path")
      .eq("event_id", ev.id)
      .order("taken_at", { ascending: true });
    if (error) throw new Error(error.message);

    const photoIds = (photos ?? []).map((p) => p.id);

    const [reactionsRes, commentsRes] = await Promise.all([
      photoIds.length
        ? supabaseAdmin
            .from("reactions")
            .select("photo_id, emoji, viewer_token")
            .in("photo_id", photoIds)
        : Promise.resolve({ data: [], error: null } as any),
      photoIds.length
        ? supabaseAdmin
            .from("comments")
            .select("photo_id", { count: "exact", head: false })
            .in("photo_id", photoIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    // Sign URLs (1h TTL)
    const signed = await Promise.all(
      (photos ?? []).map(async (p) => {
        const { data: s } = await supabaseAdmin.storage
          .from("event-photos")
          .createSignedUrl(p.storage_path, 60 * 60);
        return { ...p, url: s?.signedUrl ?? null };
      }),
    );

    const reactionsByPhoto: Record<string, Record<string, number>> = {};
    const myReactionByPhoto: Record<string, string | null> = {};
    for (const r of (reactionsRes.data as any[]) ?? []) {
      reactionsByPhoto[r.photo_id] ??= {};
      reactionsByPhoto[r.photo_id][r.emoji] = (reactionsByPhoto[r.photo_id][r.emoji] ?? 0) + 1;
      if (data.viewerToken && r.viewer_token === data.viewerToken) {
        myReactionByPhoto[r.photo_id] = r.emoji;
      }
    }

    const commentsByPhoto: Record<string, number> = {};
    for (const c of (commentsRes.data as any[]) ?? []) {
      commentsByPhoto[c.photo_id] = (commentsByPhoto[c.photo_id] ?? 0) + 1;
    }

    const enriched = signed
      .filter((p) => p.url)
      .map((p) => ({
        id: p.id,
        takenAt: p.taken_at,
        url: p.url!,
        reactions: reactionsByPhoto[p.id] ?? {},
        totalReactions: Object.values(reactionsByPhoto[p.id] ?? {}).reduce((a, b) => a + b, 0),
        myReaction: myReactionByPhoto[p.id] ?? null,
        commentCount: commentsByPhoto[p.id] ?? 0,
      }));

    // Featured: top 3 by total reactions (only if at least one reaction exists)
    const hasReactions = enriched.some((p) => p.totalReactions > 0);
    const featuredIds = hasReactions
      ? [...enriched]
          .filter((p) => p.totalReactions > 0)
          .sort((a, b) => b.totalReactions - a.totalReactions)
          .slice(0, 3)
          .map((p) => p.id)
      : [];

    return {
      event: {
        id: ev.id,
        name: ev.name,
        code: ev.code,
        expiresAt: ev.album_expires_at,
        publishedAt: ev.album_published_at,
      },
      photos: enriched,
      featuredIds,
    };
  });

export const toggleReaction = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      code: codeSchema,
      viewerToken: uuidSchema,
      photoId: uuidSchema,
      emoji: z.enum(EMOJIS),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ev = await loadPublishedEvent(data.code);

    const { data: existing } = await supabaseAdmin
      .from("reactions")
      .select("id, emoji")
      .eq("photo_id", data.photoId)
      .eq("viewer_token", data.viewerToken)
      .maybeSingle();

    if (existing) {
      if (existing.emoji === data.emoji) {
        // Remove
        await supabaseAdmin.from("reactions").delete().eq("id", existing.id);
        return { myReaction: null as string | null };
      }
      // Switch
      await supabaseAdmin
        .from("reactions")
        .update({ emoji: data.emoji })
        .eq("id", existing.id);
      return { myReaction: data.emoji };
    }

    const { error } = await supabaseAdmin.from("reactions").insert({
      photo_id: data.photoId,
      event_id: ev.id,
      viewer_token: data.viewerToken,
      emoji: data.emoji,
    });
    if (error) throw new Error(error.message);
    return { myReaction: data.emoji };
  });

export const addComment = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      code: codeSchema,
      viewerToken: uuidSchema,
      photoId: uuidSchema,
      nickname: z.string().min(1).max(40),
      body: z.string().min(1).max(140),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ev = await loadPublishedEvent(data.code);
    const { data: row, error } = await supabaseAdmin
      .from("comments")
      .insert({
        photo_id: data.photoId,
        event_id: ev.id,
        viewer_token: data.viewerToken,
        nickname: data.nickname.trim(),
        body: data.body.trim(),
      })
      .select("id, nickname, body, created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "No se pudo enviar");
    return row;
  });

export const listComments = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ code: codeSchema, photoId: uuidSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    await loadPublishedEvent(data.code);
    const { data: rows, error } = await supabaseAdmin
      .from("comments")
      .select("id, nickname, body, created_at, viewer_token")
      .eq("photo_id", data.photoId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const registerPushSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      eventId: uuidSchema,
      viewerToken: uuidSchema,
      nickname: z.string().max(60).optional(),
      subscription: z.any(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("album_viewers")
      .upsert(
        {
          event_id: data.eventId,
          viewer_token: data.viewerToken,
          nickname: data.nickname ?? null,
          push_subscription: data.subscription,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,viewer_token" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Used by guest camera screen to know if album is published
export const getEventAlbumStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ eventId: uuidSchema }).parse(input))
  .handler(async ({ data }) => {
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, code, name, album_published_at, album_expires_at")
      .eq("id", data.eventId)
      .single();
    if (!ev) return { published: false, code: null, expiresAt: null };
    return {
      published: !!ev.album_published_at,
      code: ev.code,
      name: ev.name,
      expiresAt: ev.album_expires_at,
    };
  });