import { createFileRoute } from "@tanstack/react-router";
import { sendCameraReminderPushes } from "@/lib/push.server";

export const Route = createFileRoute("/api/cron/camera-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
          console.error("CRON_SECRET is not configured");
          return new Response("Not configured", { status: 500 });
        }
        if (request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const result = await sendCameraReminderPushes();
          return Response.json(result);
        } catch (e) {
          console.error("camera-reminders cron failed", e);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
