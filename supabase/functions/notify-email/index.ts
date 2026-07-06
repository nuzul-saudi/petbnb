// notify-email — Phase 2b email channel (WRITTEN, not yet deployed).
//
// Flow (plan: docs/migration-0047-notifications-plan.md §6):
//   notifications INSERT
//     → Supabase Database Webhook (dashboard-configured) POSTs here
//     → this function renders a localized subject+body for the type
//     → sends via the Resend API
//     → stamps notifications.emailed_at (service role; the 0049 guard
//       replacement permits the forward-only stamp)
//
// DEPLOY ORDER MATTERS: apply migration 0049 (guard replacement) BEFORE
// enabling the webhook — otherwise the emailed_at stamp raises and every
// delivery reports failure. Full runbook: docs/phase-2b-email-runbook.md.
//
// Secrets (set via `supabase secrets set`, never committed):
//   RESEND_API_KEY   — Resend → API Keys (NOT the SMTP credentials)
//   EMAIL_FROM       — verified sender, e.g. "Petbnb <notify@yourdomain>"
//                      (during testing: "onboarding@resend.dev")
//   WEBHOOK_SECRET   — shared secret; the webhook sends it in the
//                      x-webhook-secret header, we reject anything else
//   APP_BASE_URL     — deployed web app origin for deep links, e.g.
//                      https://petbnb.vercel.app
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected by the
// platform into every Edge Function.
//
// Privacy: the email contains ONLY the localized title + a link — no
// message bodies, no names beyond what the recipient already sees.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title_key: string;
  body_params: Record<string, unknown>;
  link_path: string;
  created_at: string;
  read_at: string | null;
  emailed_at: string | null;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: NotificationRow | null;
};

// ---------------------------------------------------------------------------
// Server-side template mirror (plan D2 — deliberate small duplication;
// Deno can't import src/locales). Subject + body per type, ar + en.
// Masculine register, matching the app's locked copy decisions.
// ---------------------------------------------------------------------------
const TEMPLATES: Record<
  string,
  { ar: { subject: string; body: string }; en: { subject: string; body: string } }
> = {
  booking_requested: {
    ar: {
      subject: 'Petbnb — طلب حجز جديد',
      body: 'وصلك طلب حجز جديد على إعلانك. افتح التطبيق للرد.',
    },
    en: {
      subject: 'Petbnb — New booking request',
      body: 'You have a new booking request on your listing. Open the app to respond.',
    },
  },
  booking_accepted: {
    ar: {
      subject: 'Petbnb — تم قبول حجزك',
      body: 'قبل المضيف طلب حجزك. افتح التطبيق لمتابعة التفاصيل.',
    },
    en: {
      subject: 'Petbnb — Your booking was accepted',
      body: 'The host accepted your booking request. Open the app for the details.',
    },
  },
  booking_declined: {
    ar: {
      subject: 'Petbnb — تم رفض حجزك',
      body: 'نأسف — رفض المضيف طلب حجزك. يمكنك تصفح مضيفين آخرين في التطبيق.',
    },
    en: {
      subject: 'Petbnb — Your booking was declined',
      body: 'Sorry — the host declined your booking request. You can browse other hosts in the app.',
    },
  },
  booking_cancelled: {
    ar: {
      subject: 'Petbnb — تم إلغاء حجز',
      body: 'ألغى صاحب الحيوان حجزاً على إعلانك. افتح التطبيق للتفاصيل.',
    },
    en: {
      subject: 'Petbnb — A booking was cancelled',
      body: 'A pet owner cancelled a booking on your listing. Open the app for details.',
    },
  },
  message_received: {
    ar: {
      subject: 'Petbnb — رسالة جديدة',
      body: 'وصلتك رسالة جديدة. افتح المحادثة للرد.',
    },
    en: {
      subject: 'Petbnb — New message',
      body: 'You have a new message. Open the conversation to reply.',
    },
  },
  host_application_approved: {
    ar: {
      subject: 'Petbnb — تمت الموافقة على طلبك للاستضافة',
      body: 'مبروك! تمت الموافقة على طلبك. أكمل ملفك لبدء استقبال الحجوزات.',
    },
    en: {
      subject: 'Petbnb — Your host application was approved',
      body: 'Congratulations! Your application was approved. Complete your profile to start hosting.',
    },
  },
  host_application_rejected: {
    ar: {
      subject: 'Petbnb — بخصوص طلبك للاستضافة',
      body: 'نأسف — لم تتم الموافقة على طلبك حالياً. افتح التطبيق للاطلاع على السبب.',
    },
    en: {
      subject: 'Petbnb — About your host application',
      body: "Sorry — your application wasn't approved at this time. Open the app to see the reason.",
    },
  },
};

// message_received is throttled per thread per hour (plan D3). All other
// types email unconditionally (they're rare, high-value events).
const THROTTLED_TYPES = new Set(['message_received']);

Deno.serve(async (req) => {
  // ── Auth: shared-secret header set on the Database Webhook ──────────
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const row = payload.record;
  if (
    payload.type !== 'INSERT' ||
    payload.table !== 'notifications' ||
    !row ||
    !TEMPLATES[row.type]
  ) {
    // Not ours / unknown type — ack so the webhook doesn't retry.
    return new Response('ignored', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Throttle (message_received): max one email per thread per hour.
  // The R2 dedupe already collapses unread rows per thread; this guards
  // the re-read-re-notify case (read → new message → new row < 1h later).
  if (THROTTLED_TYPES.has(row.type)) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('type', row.type)
      .eq('link_path', row.link_path)
      .gt('emailed_at', oneHourAgo)
      .limit(1);
    if (recent && recent.length > 0) {
      return new Response('throttled', { status: 200 });
    }
  }

  // ── Recipient email (auth.users — service role only) + locale ───────
  const { data: userData, error: userErr } =
    await supabase.auth.admin.getUserById(row.user_id);
  const email = userData?.user?.email;
  if (userErr || !email) {
    // No email (or lookup failed) — nothing to send; ack.
    return new Response('no recipient email', { status: 200 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', row.user_id)
    .single();
  const locale: 'ar' | 'en' = profile?.locale === 'en' ? 'en' : 'ar';

  const tpl = TEMPLATES[row.type][locale];
  const baseUrl = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '');
  const link = `${baseUrl}${row.link_path}`;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const cta = locale === 'ar' ? 'فتح Petbnb' : 'Open Petbnb';

  const html = `
    <div dir="${dir}" style="font-family: Tahoma, Arial, sans-serif; background:#FAF6EE; padding:24px;">
      <div style="max-width:480px; margin:0 auto; background:#FFFCF5; border-radius:16px; padding:24px; border:1px solid #E8DFCC;">
        <h2 style="color:#1A3018; margin:0 0 12px;">${tpl.subject}</h2>
        <p style="color:#1F2A1D; line-height:1.7; margin:0 0 20px;">${tpl.body}</p>
        <a href="${link}" style="display:inline-block; background:#2D4A2F; color:#FAF6EE; padding:10px 22px; border-radius:999px; text-decoration:none;">${cta}</a>
      </div>
    </div>`;

  // ── Send via Resend ─────────────────────────────────────────────────
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'onboarding@resend.dev';
  if (!resendKey) {
    return new Response('email disabled (no RESEND_API_KEY)', { status: 200 });
  }

  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: email, subject: tpl.subject, html }),
  });

  if (!sendRes.ok) {
    // Non-2xx from Resend: report failure so the webhook's retry policy
    // can re-attempt. emailed_at stays NULL (throttle won't block retry).
    const detail = await sendRes.text();
    console.error('[notify-email] resend failed', sendRes.status, detail);
    return new Response('send failed', { status: 500 });
  }

  // ── Stamp emailed_at (forward-only; permitted by the 0049 guard) ────
  const { error: stampErr } = await supabase
    .from('notifications')
    .update({ emailed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('emailed_at', null);
  if (stampErr) {
    // Email went out but the stamp failed — log loudly (a retry would
    // double-send since emailed_at is the throttle anchor).
    console.error('[notify-email] emailed_at stamp failed', stampErr);
  }

  return new Response('sent', { status: 200 });
});
