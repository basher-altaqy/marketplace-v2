const express = require('express');
const router = express.Router();
const { authRequired, query } = require('../services/marketplace.service');
const {
  POLL_SINCE_MAX_DAYS,
  POLL_RETRY_AFTER_SECONDS,
  POLL_DEBUG_LOGS
} = require('../config/env');

const DEFAULT_BOOTSTRAP_WINDOW_HOURS = 24;
const MAX_CONVERSATIONS_PER_POLL = 120;
const MAX_NOTIFICATIONS_PER_POLL = 120;
const MAX_MESSAGES_PER_POLL = 200;

function toValidDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function resolveSince(rawSince) {
  const now = new Date();
  const maxWindowMs = POLL_SINCE_MAX_DAYS * 24 * 60 * 60 * 1000;
  const defaultWindowMs = DEFAULT_BOOTSTRAP_WINDOW_HOURS * 60 * 60 * 1000;
  const minAllowed = new Date(now.getTime() - maxWindowMs);
  const defaultSince = new Date(now.getTime() - defaultWindowMs);

  const parsed = toValidDate(rawSince);
  if (!parsed) {
    return {
      since: null,
      effectiveSince: defaultSince,
      reason: rawSince ? 'invalid' : 'missing'
    };
  }

  if (parsed > now) {
    return {
      since: null,
      effectiveSince: defaultSince,
      reason: 'future'
    };
  }

  if (parsed < minAllowed) {
    return {
      since: minAllowed,
      effectiveSince: minAllowed,
      reason: 'clamped'
    };
  }

  return {
    since: parsed,
    effectiveSince: parsed,
    reason: 'ok'
  };
}

function mapConversationRow(row) {
  return {
    id: row.id,
    conversationType: row.conversation_type || 'inquiry',
    status: row.status,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    product: {
      id: row.product_id,
      name: row.product_name,
      status: row.product_status
    },
    seller: {
      id: row.seller_id,
      fullName: row.seller_full_name,
      storeName: row.seller_store_name || row.seller_full_name
    },
    buyer: {
      id: row.buyer_id,
      fullName: row.buyer_full_name
    },
    lastMessage: row.last_message
  };
}

function mapNotificationRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    metadata: row.metadata_json || {},
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMessageRow(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.message_body,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at
  };
}

router.get('/api/poll', authRequired, async (req, res, next) => {
  try {
    const { since, effectiveSince, reason } = resolveSince(req.query.since);
    const conversationId = Number.parseInt(String(req.query.conversationId || ''), 10);
    const activeConversationId = Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null;
    const isAdmin = req.user?.role === 'admin';

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    if (POLL_RETRY_AFTER_SECONDS > 0) {
      res.setHeader('Retry-After', String(POLL_RETRY_AFTER_SECONDS));
    }
    if (POLL_DEBUG_LOGS) {
      res.setHeader('X-Poll-Debug', '1');
    }

    const sinceIso = effectiveSince.toISOString();
    const conversationsParams = [req.user.id, sinceIso, MAX_CONVERSATIONS_PER_POLL];
    const notificationsParams = [req.user.id, sinceIso, MAX_NOTIFICATIONS_PER_POLL];

    const conversationsSql = `
      SELECT
        c.id,
        c.conversation_type,
        c.status,
        c.last_message_at,
        c.created_at,
        c.updated_at,
        p.id AS product_id,
        p.name AS product_name,
        p.status AS product_status,
        s.id AS seller_id,
        s.full_name AS seller_full_name,
        s.store_name AS seller_store_name,
        b.id AS buyer_id,
        b.full_name AS buyer_full_name,
        (
          SELECT m.message_body
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message
      FROM conversations c
      JOIN products p ON p.id = c.product_id
      JOIN users s ON s.id = c.seller_id
      JOIN users b ON b.id = c.buyer_id
      WHERE (${isAdmin ? 'TRUE' : '(c.seller_id = $1 OR c.buyer_id = $1)'})
        AND (
          c.updated_at > $2::timestamptz
          OR c.last_message_at > $2::timestamptz
          OR EXISTS (
            SELECT 1
            FROM messages m2
            WHERE m2.conversation_id = c.id
              AND m2.created_at > $2::timestamptz
          )
        )
      ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC, c.id DESC
      LIMIT $3
    `;

    const notificationsSql = `
      SELECT *
      FROM notifications
      WHERE user_id = $1
        AND (
          created_at > $2::timestamptz
          OR updated_at > $2::timestamptz
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $3
    `;

    let messagesPromise = Promise.resolve({ rows: [] });
    if (activeConversationId) {
      if (isAdmin) {
        messagesPromise = query(
          `
            SELECT
              m.id,
              m.conversation_id,
              m.sender_id,
              u.full_name AS sender_name,
              m.message_body,
              m.is_read,
              m.created_at
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.conversation_id = $1
              AND m.created_at > $2::timestamptz
            ORDER BY m.created_at ASC, m.id ASC
            LIMIT $3
          `,
          [activeConversationId, sinceIso, MAX_MESSAGES_PER_POLL]
        );
      } else {
        messagesPromise = query(
          `
            SELECT
              m.id,
              m.conversation_id,
              m.sender_id,
              u.full_name AS sender_name,
              m.message_body,
              m.is_read,
              m.created_at
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            JOIN conversations c ON c.id = m.conversation_id
            WHERE m.conversation_id = $1
              AND (c.seller_id = $2 OR c.buyer_id = $2)
              AND m.created_at > $3::timestamptz
            ORDER BY m.created_at ASC, m.id ASC
            LIMIT $4
          `,
          [activeConversationId, req.user.id, sinceIso, MAX_MESSAGES_PER_POLL]
        );
      }
    }

    const [conversationsResult, notificationsResult, messagesResult] = await Promise.all([
      query(conversationsSql, conversationsParams),
      query(notificationsSql, notificationsParams),
      messagesPromise
    ]);

    if (POLL_DEBUG_LOGS) {
      console.log(
        `[poll] user=${req.user.id} since=${sinceIso} reason=${reason} conversations=${conversationsResult.rows.length} notifications=${notificationsResult.rows.length} messages=${messagesResult.rows.length}`
      );
    }

    const serverNow = new Date().toISOString();
    res.json({
      conversations: conversationsResult.rows.map(mapConversationRow),
      notifications: notificationsResult.rows.map(mapNotificationRow),
      messages: messagesResult.rows.map(mapMessageRow),
      serverNow
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
