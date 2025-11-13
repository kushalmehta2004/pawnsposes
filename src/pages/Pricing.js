import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import puzzleAccessService from '../services/puzzleAccessService';
import { createRazorpayOrder, createRazorpaySubscription, openRazorpayCheckout } from '../services/razorpayService';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    period: '',
    features: [
      '1 full PDF report (first time only)',
      'Teaser puzzles (1 per section)',
    ],
    cta: 'Get Started',
    highlight: false,
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: '₹619',
    period: '/mo',
    features: [
      'Weekly puzzles unlocked (4 sections)',
      'Puzzles refresh every week from new games',
      'Download updated PDF report each week',
    ],
    cta: 'Choose Monthly',
    highlight: false,
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    price: '₹1682',
    period: '/3 mo',
    features: [
      '3 months of weekly puzzle access',
      '12 updated puzzle sets + reports',
    ],
    cta: 'Choose Quarterly',
    highlight: true,
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '₹5314',
    period: '/yr',
    features: [
      'Full-year puzzle access (52 sets)',
      'Reports included each week automatically',
      'Priority new features',
    ],
    cta: 'Choose Annual',
    highlight: false,
  },
  {
    id: 'one-time',
    name: 'One-Time Pack',
    price: '₹442',
    period: '',
    features: [
      "Unlock just this week's puzzles",
      'Great low-cost tryout',
    ],
    cta: 'Buy One-Time Pack',
    highlight: false,
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectPlan = async (planId) => {
    // Stub: navigate to auth or show checkout coming soon
    if (planId === 'free') {
      navigate('/reports');
      return;
    }
    // One-time (Razorpay order)
    if (planId === 'one-time') {
      const reportId = location.state?.reportId;
      if (!user?.id) {
        navigate('/auth', { state: { intent: 'checkout', planId, reportId } });
        return;
      }
      try {
        setIsProcessing(true);
        const order = await createRazorpayOrder({ amount: 442, userId: user.id, reportId });
        await openRazorpayCheckout({ order, user, reportId });
        // Webhook will finalize unlock
        navigate('/report-display', { state: { ...location.state } });
      } catch (_) {
        setIsProcessing(false);
      }
      return;
    }

    // Subscriptions (Razorpay)
    try {
      setIsProcessing(true);
      const sub = await createRazorpaySubscription({ planId, userId: user?.id });
      // Razorpay expects you to open checkout with subscription_id
      const ok = await (async () => {
        const loaded = await (new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          document.body.appendChild(s);
        }));
        if (!loaded) return false;
        const options = {
          key: process.env.REACT_APP_RAZORPAY_KEY_ID,
          subscription_id: sub?.id,
          name: 'Pawns & Poses',
          description: 'Personalized puzzles subscription',
          prefill: { email: user?.email || '' },
          notes: { userId: user?.id || '', planId },
          handler: function () { /* webhook will activate */ },
          theme: { color: '#10b981' }
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
        return true;
      })();
      if (ok) navigate('/report-display'); else setIsProcessing(false);
    } catch (e) {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingTop: '80px' }}>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900">Unlock Personalized Training</h1>
          <p className="mt-3 text-gray-600">1 free report to start. Subscribe to fix weaknesses with weekly puzzles.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.slice(0, 3).map((plan) => (
            <div key={plan.id} className={`bg-white rounded-xl shadow-md border ${plan.highlight ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                <div className="mt-2 flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                  {plan.period && <span className="text-gray-500">{plan.period}</span>}
                </div>
                <ul className="mt-6 space-y-2">
                  {plan.features.map((f, idx) => (
                    <li key={idx} className="text-sm text-gray-700">• {f}</li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isProcessing}
                  className={`mt-6 w-full px-4 py-3 rounded-lg font-semibold transition-colors ${plan.id === 'free' ? 'bg-gray-800 hover:bg-gray-900 text-white' : 'bg-green-600 hover:bg-green-700 text-white'} ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''}`}
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {plans.slice(3).map((plan) => (
            <div key={plan.id} className="bg-white rounded-xl shadow-md border border-gray-200">
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                <div className="mt-2 flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                  {plan.period && <span className="text-gray-500">{plan.period}</span>}
                </div>
                <ul className="mt-6 space-y-2">
                  {plan.features.map((f, idx) => (
                    <li key={idx} className="text-sm text-gray-700">• {f}</li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  className="mt-6 w-full px-4 py-3 rounded-lg font-semibold transition-colors bg-green-600 hover:bg-green-700 text-white"
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-gray-500">
          Prices in INR. Billing handled securely via Razorpay.
        </div>
      </div>
    </div>
  );
};

export default Pricing;

