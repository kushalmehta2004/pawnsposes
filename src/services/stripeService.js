export const createCheckout = async ({ planId, userId, reportId }) => {
  const base = process.env.REACT_APP_SERVER_URL || 'http://localhost:8787';
  const res = await fetch(`${base}/api/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, userId, reportId })
  });
  if (!res.ok) throw new Error('Failed to create checkout session');
  const data = await res.json();
  return data?.url;
};


