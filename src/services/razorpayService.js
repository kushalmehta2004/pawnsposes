const loadScript = (src) => new Promise((resolve) => {
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

export const openRazorpayCheckout = async ({ order, user, reportId }) => {
  const ok = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  if (!ok) throw new Error('Failed to load Razorpay');

  return new Promise((resolve, reject) => {
    const options = {
      key: process.env.REACT_APP_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: 'Pawns & Poses',
      description: 'Personalized puzzles',
      order_id: order.id,
      prefill: {
        email: user?.email || '',
      },
      notes: { userId: user?.id || '', reportId: reportId || '' },
      handler: function (response) {
        // Success callback; server-side webhook will unlock
        resolve(response);
      },
      modal: {
        ondismiss: function () {
          reject(new Error('Payment cancelled'));
        }
      },
      theme: { color: '#10b981' }
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  });
};

export const createRazorpayOrder = async ({ amount, userId, reportId }) => {
  const base = process.env.REACT_APP_SERVER_URL || 'http://localhost:8787';
  const res = await fetch(`${base}/api/rzp/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: 'INR', userId, reportId })
  });
  if (!res.ok) throw new Error('Failed to create order');
  const data = await res.json();
  return data?.order;
};

export const createRazorpaySubscription = async ({ planId, userId }) => {
  const base = process.env.REACT_APP_SERVER_URL || 'http://localhost:8787';
  const res = await fetch(`${base}/api/rzp/create-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, userId })
  });
  if (!res.ok) throw new Error('Failed to create subscription');
  const data = await res.json();
  return data?.subscription;
};


