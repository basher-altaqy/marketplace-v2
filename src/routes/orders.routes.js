const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const {
  authRequired,
  query,
  getOrderById,
  getOrdersSummaryForUser,
  getProductById
} = require('../services/marketplace.service');
const { createNotification, logSystemEvent } = require('../services/platform.service');

const ORDER_STATUSES = ['submitted', 'seller_confirmed', 'buyer_confirmed', 'in_preparation', 'in_transport', 'completed', 'cancelled'];
const V1_UI_ORDER_TRANSITIONS = ['seller_confirmed', 'cancelled'];
const LEGACY_READ_ONLY_ORDER_STATUSES = ['buyer_confirmed', 'in_preparation', 'in_transport', 'completed'];

function validateOrderTransition(user, order, nextStatus) {
  if (!ORDER_STATUSES.includes(nextStatus)) {
    return { allowed: false, reason: 'Invalid order status.' };
  }

  if (user.role === 'admin') {
    return { allowed: true };
  }

  const isBuyer = order.buyerId === user.id;
  const isSeller = order.sellerId === user.id;

  if (!isBuyer && !isSeller) {
    return { allowed: false, reason: 'Forbidden.' };
  }

  if (order.status === 'completed' || order.status === 'cancelled') {
    return { allowed: false, reason: 'This action is no longer available.' };
  }

  if (nextStatus === 'seller_confirmed') {
    return order.status === 'submitted' && isSeller
      ? { allowed: true }
      : { allowed: false, reason: 'Waiting for the seller response first.' };
  }

  if (nextStatus === 'cancelled') {
    return order.status === 'submitted' && isSeller
      ? { allowed: true }
      : { allowed: false, reason: 'Only the seller can reject this purchase request.' };
  }

  if (LEGACY_READ_ONLY_ORDER_STATUSES.includes(nextStatus)) {
    return { allowed: false, reason: 'This legacy transition is not available in MVP v1.' };
  }

  return { allowed: false, reason: 'Only accept or reject actions are available for this order.' };
}

function getOrderStatusMessage(status, orderId, totalAmount) {
  const totalLabel = Number(totalAmount || 0).toFixed(2);
  const messages = {
    submitted: `تم إنشاء طلب شراء جديد رقم #${orderId} بقيمة ${totalLabel}.`,
    seller_confirmed: `قبل التاجر طلب الشراء #${orderId}.`,
    buyer_confirmed: `أكد المشتري الطلب #${orderId}.`,
    in_preparation: `بدأ التاجر تجهيز الطلب #${orderId}.`,
    in_transport: `أصبح الطلب #${orderId} في مرحلة النقل.`,
    completed: `اكتمل الطلب #${orderId}.`,
    cancelled: `رفض التاجر طلب الشراء #${orderId}.`
  };

  return messages[status] || `تم تحديث حالة الطلب #${orderId}.`;
}

async function createOrderConversation(client, { buyerId, sellerId, productId }) {
  const createResult = await client.query(
    `INSERT INTO conversations (product_id, seller_id, buyer_id, conversation_type, status, last_message_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'order', 'open', NOW(), NOW(), NOW())
     RETURNING id`,
    [productId, sellerId, buyerId]
  );

  return createResult.rows[0].id;
}

async function insertConversationMessage(client, { conversationId, senderId, body }) {
  await client.query(
    `INSERT INTO messages (conversation_id, sender_id, message_body, is_read)
     VALUES ($1, $2, $3, FALSE)`,
    [conversationId, senderId, body]
  );
  await client.query(
    `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );
}

async function insertOrderConversationMessage(client, { conversationId, senderId, orderId, totalAmount, status = 'submitted' }) {
  await insertConversationMessage(client, {
    conversationId,
    senderId,
    body: getOrderStatusMessage(status, orderId, totalAmount)
  });
}

async function createSingleProductOrder(client, {
  buyerId,
  product,
  quantity,
  paymentMethod,
  notes,
  message,
  senderId,
  sourceType,
  sourceRefId
}) {
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const totalAmount = Number(product.price || 0) * safeQuantity;
  const conversationId = await createOrderConversation(client, {
    buyerId,
    sellerId: product.seller.id,
    productId: product.id
  });

  const orderResult = await client.query(
    `INSERT INTO orders (
       buyer_id, seller_id, conversation_id, source_type, source_ref_id, total_amount, status, payment_method, notes, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7, $8, NOW(), NOW())
     RETURNING id`,
    [buyerId, product.seller.id, conversationId, sourceType, sourceRefId, totalAmount, paymentMethod, notes]
  );

  const orderId = orderResult.rows[0].id;

  await client.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [orderId, product.id, safeQuantity, Number(product.price || 0)]
  );

  await insertOrderConversationMessage(client, {
    conversationId,
    senderId,
    orderId,
    totalAmount,
    status: 'submitted'
  });

  if (message && String(message).trim()) {
    await insertConversationMessage(client, {
      conversationId,
      senderId,
      body: String(message).trim()
    });
  }

  return { orderId, conversationId, totalAmount };
}

router.post('/api/orders', authRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const sourceType = String(req.body.sourceType || '').trim();
    const sourceRefId = Number(req.body.sourceRefId);
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const paymentMethod = req.body.paymentMethod?.trim() || 'manual';
    const notes = req.body.notes?.trim() || null;
    const message = req.body.message?.trim() || null;

    if (!['cart', 'conversation', 'product'].includes(sourceType) || !Number.isInteger(sourceRefId)) {
      return res.status(400).json({ error: 'Invalid order source.' });
    }

    await client.query('BEGIN');

    if (sourceType === 'cart') {
      const cartResult = await client.query(
        `SELECT * FROM carts WHERE id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
        [sourceRefId, req.user.id]
      );
      const cart = cartResult.rows[0];
      if (!cart) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Cart not found.' });
      }

      const itemsResult = await client.query(
        `SELECT * FROM cart_items WHERE cart_id = $1 ORDER BY id ASC`,
        [cart.id]
      );
      const items = itemsResult.rows;

      if (!items.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cart is empty.' });
      }

      const groupedBySeller = items.reduce((acc, item) => {
        const key = String(item.seller_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});

      const createdOrders = [];

      for (const sellerId of Object.keys(groupedBySeller)) {
        const sellerItems = groupedBySeller[sellerId];
        const primaryItem = sellerItems[0];
        const totalAmount = sellerItems.reduce((sum, item) => {
          return sum + Number(item.snapshot_price || 0) * Number(item.quantity || 0);
        }, 0);
        const conversationId = await createOrderConversation(client, {
          buyerId: req.user.id,
          sellerId: Number(sellerId),
          productId: primaryItem.product_id
        });

        const orderResult = await client.query(
          `INSERT INTO orders (
             buyer_id, seller_id, conversation_id, source_type, source_ref_id, total_amount, status, payment_method, notes, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'cart', $4, $5, 'submitted', $6, $7, NOW(), NOW())
           RETURNING id`,
          [req.user.id, Number(sellerId), conversationId, cart.id, totalAmount, paymentMethod, notes]
        );

        const orderId = orderResult.rows[0].id;

        for (const item of sellerItems) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, quantity, price, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [orderId, item.product_id, item.quantity, item.snapshot_price]
          );
        }

        await insertOrderConversationMessage(client, {
          conversationId,
          senderId: req.user.id,
          orderId,
          totalAmount,
          status: 'submitted'
        });

        createdOrders.push(orderId);
      }

      await client.query(`UPDATE carts SET status = 'archived', updated_at = NOW() WHERE id = $1`, [cart.id]);
      await client.query('COMMIT');

      const orders = await Promise.all(createdOrders.map((id) => getOrderById(id, req.user)));
      for (const createdOrder of orders) {
        if (!createdOrder) continue;
        await createNotification(
          createdOrder.sellerId,
          'order',
          'طلب شراء جديد',
          `تم إرسال طلب شراء جديد رقم #${createdOrder.id}.`,
          '/orders',
          { orderId: createdOrder.id }
        );
      }

      return res.status(201).json({ orders });
    }

    if (sourceType === 'product') {
      const product = await getProductById(sourceRefId);
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found.' });
      }

      if (product.status !== 'published') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Product is not available.' });
      }

      if (product.seller.id === req.user.id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Buyer cannot purchase own product.' });
      }

      const { orderId } = await createSingleProductOrder(client, {
        buyerId: req.user.id,
        product,
        quantity,
        paymentMethod,
        notes,
        message,
        senderId: req.user.id,
        sourceType: 'product',
        sourceRefId: product.id
      });

      await client.query('COMMIT');

      const order = await getOrderById(orderId, req.user);
      if (order) {
        await createNotification(
          order.sellerId,
          'order',
          'طلب شراء جديد',
          `تم إرسال طلب شراء جديد على المنتج: ${product.name}.`,
          '/orders',
          { orderId: order.id }
        );
      }

      return res.status(201).json({ order });
    }

    const dealResult = await client.query(
      `SELECT * FROM conversation_deals WHERE id = $1 LIMIT 1`,
      [sourceRefId]
    );
    const deal = dealResult.rows[0];
    if (!deal) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conversation deal not found.' });
    }

    if (deal.buyer_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const totalAmount = Number(deal.agreed_price || 0) * Number(deal.quantity || 0);
    const conversationId = await createOrderConversation(client, {
      buyerId: deal.buyer_id,
      sellerId: deal.seller_id,
      productId: deal.product_id
    });
    const orderResult = await client.query(
      `INSERT INTO orders (
         buyer_id, seller_id, conversation_id, source_type, source_ref_id, total_amount, status, payment_method, notes, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'conversation', $4, $5, 'submitted', $6, $7, NOW(), NOW())
       RETURNING id`,
      [deal.buyer_id, deal.seller_id, conversationId, deal.id, totalAmount, paymentMethod, notes || deal.note || null]
    );

    const orderId = orderResult.rows[0].id;

    await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, price, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [orderId, deal.product_id, deal.quantity, deal.agreed_price]
    );

    await client.query(
      `UPDATE conversation_deals SET status = 'agreed', updated_at = NOW() WHERE id = $1`,
      [deal.id]
    );

    await insertOrderConversationMessage(client, {
      conversationId,
      senderId: req.user.role === 'admin' ? deal.buyer_id : req.user.id,
      orderId,
      totalAmount,
      status: 'submitted'
    });

    await client.query('COMMIT');

    const order = await getOrderById(orderId, req.user);
    if (order) {
      await createNotification(
        order.sellerId,
        'order',
        'طلب شراء جديد',
        `تم إرسال طلب شراء جديد رقم #${order.id}.`,
        '/orders',
        { orderId: order.id }
      );
    }

    res.status(201).json({ order });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

router.get('/api/orders', authRequired, async (req, res, next) => {
  try {
    const orders = await getOrdersSummaryForUser(req.user);
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.get('/api/orders/:id', authRequired, async (req, res, next) => {
  try {
    let order = await getOrderById(Number(req.params.id), req.user);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (!order.conversationId && order.items && order.items[0]) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const conversationId = await createOrderConversation(client, {
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          productId: order.items[0].productId
        });
        await client.query(
          `UPDATE orders SET conversation_id = $1, updated_at = NOW() WHERE id = $2`,
          [conversationId, order.id]
        );
        await insertOrderConversationMessage(client, {
          conversationId,
          senderId: req.user.role === 'admin' ? order.buyerId : req.user.id,
          orderId: order.id,
          totalAmount: order.totalAmount,
          status: 'submitted'
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      order = await getOrderById(order.id, req.user);
    }

    res.json({ order });
  } catch (error) {
    next(error);
  }
});

router.put('/api/orders/:id/status', authRequired, async (req, res, next) => {
  try {
    const order = await getOrderById(Number(req.params.id), req.user);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const status = String(req.body.status || '').trim();
    const transition = validateOrderTransition(req.user, order, status);
    if (!transition.allowed) {
      return res.status(403).json({ error: transition.reason || 'Status transition is not allowed.' });
    }

    await query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, order.id]
    );

    if (order.conversationId) {
      await query(
        `INSERT INTO messages (conversation_id, sender_id, message_body, is_read)
         VALUES ($1, $2, $3, FALSE)`,
        [order.conversationId, req.user.id, getOrderStatusMessage(status, order.id, order.totalAmount)]
      );
      await query(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [order.conversationId]
      );
    }

    const refreshed = await getOrderById(order.id, req.user);
    const notifyUserId = req.user.id === order.buyerId ? order.sellerId : order.buyerId;
    await createNotification(
      notifyUserId,
      'order',
      'تحديث على حالة الطلب',
      getOrderStatusMessage(status, order.id, order.totalAmount),
      '/orders',
      { orderId: order.id, status }
    );
    await logSystemEvent('info', 'order', 'order status updated', { orderId: order.id, status }, req.user.id);
    res.json({ order: refreshed });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
