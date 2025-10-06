// Minimal Stripe server for checkout + webhooks
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Environment
const PORT = process.env.PORT || 8787;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = Stripe(STRIPE_SECRET_KEY);

// Razorpay
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_PLANS = {
  monthly: process.env.RAZORPAY_PLAN_MONTHLY || '',
  quarterly: process.env.RAZORPAY_PLAN_QUARTERLY || '',
  annual: process.env.RAZORPAY_PLAN_ANNUAL || ''
};
const razorpay = (RZP_KEY_ID && RZP_KEY_SECRET)
  ? new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET })
  : null;

// Supabase (service role for webhooks)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Price ID map (configure in env)
const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || '',
  quarterly: process.env.STRIPE_PRICE_QUARTERLY || '',
  annual: process.env.STRIPE_PRICE_ANNUAL || '',
  oneTime: process.env.STRIPE_PRICE_ONE_TIME || ''
};

// CORS and JSON (avoid JSON for webhooks route)
app.use(cors({ origin: FRONTEND_URL }));
app.use('/api', bodyParser.json());
// Razorpay webhooks also use raw body for signature verification
app.use('/razorpay-webhook', bodyParser.raw({ type: '*/*' }));

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Create Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { planId, userId, reportId } = req.body || {};
    if (!planId || !userId) {
      return res.status(400).json({ error: 'Missing planId or userId' });
    }

    const isOneTime = planId === 'one-time';
    const priceId = isOneTime
      ? PRICE_IDS.oneTime
      : planId === 'monthly' ? PRICE_IDS.monthly
      : planId === 'quarterly' ? PRICE_IDS.quarterly
      : planId === 'annual' ? PRICE_IDS.annual
      : '';

    if (!priceId) {
      return res.status(400).json({ error: 'Unconfigured price for planId' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: isOneTime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/report-display`,
      cancel_url: `${FRONTEND_URL}/pricing`,
      client_reference_id: userId,
      metadata: { planId, userId, reportId: reportId || '' },
      subscription_data: isOneTime ? undefined : { metadata: { planId, userId } }
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session error', e);
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// Raw body for webhook verification
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const planId = session.metadata?.planId;
      const userId = session.client_reference_id || session.metadata?.userId;
      const reportId = session.metadata?.reportId;

      // One-time unlock
      if (planId === 'one-time' && reportId && userId) {
        await supabaseAdmin.from('puzzle_unlocks').insert({
          user_id: userId,
          report_id: reportId,
          unlock_type: 'one_time_pack',
          payment_id: session.payment_intent,
          amount_paid: Number(session.amount_total || 0) / 100,
          expires_at: null
        });
      }
    }

    if (event.type === 'invoice.payment_succeeded') {
      // Subscription active/renewal
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const planId = sub.metadata?.planId || invoice.lines?.data?.[0]?.price?.id;
        const userId = sub.metadata?.userId;
        const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        if (userId) {
          await supabaseAdmin.from('user_profiles').update({
            subscription_type: planId === 'monthly' || planId === PRICE_IDS.monthly ? 'monthly' : planId === 'quarterly' || planId === PRICE_IDS.quarterly ? 'quarterly' : 'annual',
            subscription_status: 'active',
            subscription_started_at: new Date().toISOString(),
            subscription_expires_at: currentPeriodEnd,
            stripe_subscription_id: subscriptionId
          }).eq('id', userId);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (userId) {
        await supabaseAdmin.from('user_profiles').update({ subscription_status: 'cancelled' }).eq('id', userId);
      }
    }

    res.json({ received: true });
  } catch (e) {
    console.error('Webhook handler error', e);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ==========================
// Razorpay: Create One-Time Order
// ==========================
app.post('/api/rzp/create-order', async (req, res) => {
  try {
    if (!razorpay) return res.status(400).json({ error: 'Razorpay not configured' });
    const { amount, currency = 'INR', userId, reportId } = req.body || {};
    if (!amount || !userId) return res.status(400).json({ error: 'Missing amount or userId' });

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: `pp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      notes: { userId, reportId: reportId || '' }
    });
    return res.json({ order });
  } catch (e) {
    console.error('rzp create-order error', e);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

// ==========================
// Razorpay: Create Subscription
// ==========================
app.post('/api/rzp/create-subscription', async (req, res) => {
  try {
    if (!razorpay) return res.status(400).json({ error: 'Razorpay not configured' });
    const { planId, userId } = req.body || {};
    if (!planId || !userId) return res.status(400).json({ error: 'Missing planId or userId' });

    const rzpPlan = planId === 'monthly' ? RAZORPAY_PLANS.monthly : planId === 'quarterly' ? RAZORPAY_PLANS.quarterly : planId === 'annual' ? RAZORPAY_PLANS.annual : '';
    if (!rzpPlan) return res.status(400).json({ error: 'Unconfigured Razorpay plan' });

    const subscription = await razorpay.subscriptions.create({
      plan_id: rzpPlan,
      total_count: 0, // ongoing until cancelled
      notes: { userId, planId },
      customer_notify: 1
    });

    return res.json({ subscription });
  } catch (e) {
    console.error('rzp create-subscription error', e);
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// ==========================
// Razorpay Webhook
// ==========================
app.post('/razorpay-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const body = req.body; // raw buffer
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== signature) {
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(body.toString());
    const type = event.event;

    if (type === 'payment.captured') {
      // One-time order captured
      const pay = event.payload.payment?.entity;
      const orderId = pay?.order_id;
      if (orderId) {
        const order = await razorpay.orders.fetch(orderId);
        const userId = order?.notes?.userId;
        const reportId = order?.notes?.reportId;
        if (userId && reportId) {
          await supabaseAdmin.from('puzzle_unlocks').insert({
            user_id: userId,
            report_id: reportId,
            unlock_type: 'one_time_pack',
            payment_id: pay?.id,
            amount_paid: Number(pay?.amount || 0) / 100,
            expires_at: null
          });
        }
      }
    }

    if (type === 'subscription.charged' || type === 'subscription.activated' || type === 'subscription.halted') {
      const sub = event.payload.subscription?.entity;
      const userId = sub?.notes?.userId;
      const planId = sub?.notes?.planId;
      if (userId) {
        const status = sub?.status; // active, halted, cancelled, completed
        const expiresAt = sub?.current_end ? new Date(sub.current_end * 1000).toISOString() : null;
        let subType = 'monthly';
        if (planId === 'quarterly') subType = 'quarterly';
        if (planId === 'annual') subType = 'annual';
        await supabaseAdmin.from('user_profiles').update({
          subscription_type: status === 'active' ? subType : 'none',
          subscription_status: status === 'active' ? 'active' : (status === 'halted' ? 'cancelled' : 'inactive'),
          subscription_started_at: new Date().toISOString(),
          subscription_expires_at: expiresAt
        }).eq('id', userId);
      }
    }

    if (type === 'subscription.cancelled') {
      const sub = event.payload.subscription?.entity;
      const userId = sub?.notes?.userId;
      if (userId) {
        await supabaseAdmin.from('user_profiles').update({ subscription_status: 'cancelled' }).eq('id', userId);
      }
    }

    return res.json({ received: true });
  } catch (e) {
    console.error('Razorpay webhook error', e);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.listen(PORT, () => console.log(`Stripe server running on :${PORT}`));


