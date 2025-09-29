import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const LoadingScreen = ({ progressPercent = 0, currentStep = 0 }) => {
  const [animatedStep, setAnimatedStep] = useState(currentStep);
  const steps = [
    'Fetching & filtering game data...',
    'Analyzing mistakes & patterns...',
    'Validating FENs & selecting key positions...',
    'Generating AI explanations...',
    'Finalizing your comprehensive report!'
  ];

  // Add a slight delay when transitioning between steps for smoother animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedStep(currentStep);
    }, currentStep > animatedStep ? 300 : 0); // 300ms delay when moving forward for better visibility
    
    return () => clearTimeout(timer);
  }, [currentStep, animatedStep]);

  return (
    <div className="loading-screen-container">
      <style jsx>{`
        /* General page styling */
        .loading-screen-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background-color: #e9e9e9; /* A neutral background */
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        /* The main popup container */
        .analyzer-popup {
          background-color: #f7fbf7;
          border-radius: 12px;
          padding: 24px 32px;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
          width: 380px;
          border: 1px solid #dde2de;
        }

        /* The title "Analyzing Your Games..." */
        .analyzer-popup h2 {
          text-align: center;
          font-size: 24px;
          font-weight: 600;
          color: #2c2c2c;
          margin-top: 0;
          margin-bottom: 28px;
        }

        /* The list container */
        .analyzer-popup ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        /* Each list item (row) */
        .analyzer-popup li {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
          font-size: 16px;
          color: #8a8a8a; /* Lighter color for pending items */
          font-weight: 500;
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          transform: translateX(0);
        }
        
        /* The last list item has no bottom margin */
        .analyzer-popup li:last-child {
          margin-bottom: 0;
        }

        /* Common style for the status icons (the circles) */
        .status-icon {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          margin-right: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        /* --- Status-specific styles --- */

        /* Style for completed items */
        .analyzer-popup li.completed {
          color: #333;
          transform: translateX(2px);
        }
        
        /* iOS-style green checkmark icon */
        .analyzer-popup li.completed .status-icon {
          background: linear-gradient(135deg, #34C759, #30D158);
          color: white;
          box-shadow: 0 2px 8px rgba(52, 199, 89, 0.3);
          transform: scale(1.05);
          animation: checkmarkAppear 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        


        /* Style for pending items - iOS empty circle */
        .analyzer-popup li.pending .status-icon {
          background: transparent;
          border: 2px solid #E5E5EA;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        /* iOS-style subtle inner shadow for pending */
        .analyzer-popup li.pending .status-icon::before {
          content: '';
          position: absolute;
          top: 1px;
          left: 1px;
          right: 1px;
          bottom: 1px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.4));
        }

        /* Style for active/current items - iOS orange/blue style */
        .analyzer-popup li.active {
          color: #333;
          transform: translateX(4px);
          animation: activateStep 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .analyzer-popup li.active .status-icon {
          background: linear-gradient(135deg, #FF9500, #FF8C00);
          color: white;
          box-shadow: 0 2px 8px rgba(255, 149, 0, 0.3);
          animation: iosPulse 2s ease-in-out infinite, activateIcon 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        /* iOS-style loading spinner */
        .analyzer-popup li.active .status-icon::before {
          content: '';
          width: 10px;
          height: 10px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: iosSpinner 1s linear infinite;
        }

        /* iOS-style pulse animation */
        @keyframes iosPulse {
          0%, 100% { 
            transform: scale(1.05);
            box-shadow: 0 2px 8px rgba(255, 149, 0, 0.3);
          }
          50% { 
            transform: scale(1.1);
            box-shadow: 0 4px 16px rgba(255, 149, 0, 0.4);
          }
        }

        /* iOS-style spinner animation */
        @keyframes iosSpinner {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Smooth transition animations */
        @keyframes checkmarkAppear {
          0% { 
            transform: scale(0.7);
            opacity: 0;
            background: #e0e0e0;
          }
          30% { 
            transform: scale(1.2);
            opacity: 0.7;
            background: linear-gradient(135deg, #34C759, #30D158);
          }
          60% { 
            transform: scale(0.95);
            opacity: 0.9;
          }
          100% { 
            transform: scale(1.05);
            opacity: 1;
            background: linear-gradient(135deg, #34C759, #30D158);
          }
        }

        @keyframes activateStep {
          0% { 
            transform: translateX(0);
            color: #8a8a8a;
          }
          100% { 
            transform: translateX(4px);
            color: #333;
          }
        }

        @keyframes activateIcon {
          0% { 
            transform: scale(1);
            background: #e0e0e0;
            box-shadow: none;
          }
          50% { 
            transform: scale(1.1);
          }
          100% { 
            transform: scale(1);
            background: linear-gradient(135deg, #FF9500, #FF8C00);
            box-shadow: 0 2px 8px rgba(255, 149, 0, 0.3);
          }
        }

        /* Checkmark drawing animation */
        .analyzer-popup li.completed .status-icon::before {
          content: '';
          width: 6px;
          height: 10px;
          border: solid white;
          border-width: 0 2.5px 2.5px 0;
          transform: rotate(45deg);
          margin-top: -2px;
          margin-left: 1px;
          animation: drawCheckmark 0.4s ease-out 0.3s both;
        }

        @keyframes drawCheckmark {
          0% {
            width: 0;
            height: 0;
            opacity: 0;
          }
          30% {
            width: 0;
            height: 8px;
            opacity: 0.7;
          }
          70% {
            width: 4px;
            height: 10px;
            opacity: 0.9;
          }
          100% {
            width: 6px;
            height: 10px;
            opacity: 1;
          }
        }

        /* Hover effects for better interactivity */
        .analyzer-popup li.completed .status-icon:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 12px rgba(52, 199, 89, 0.4);
        }

        .analyzer-popup li.pending:hover .status-icon {
          border-color: #C7C7CC;
          transform: scale(1.05);
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="analyzer-popup"
      >
        <h2>Analyzing Your Games...</h2>
        <ul>
          {steps.map((step, index) => {
            let stepClass = 'pending';
            if (index < animatedStep) {
              stepClass = 'completed';
            } else if (index === animatedStep) {
              stepClass = 'active';
            }

            return (
              <motion.li 
                key={index} 
                className={stepClass}
                initial={false}
                animate={{
                  x: stepClass === 'completed' ? 2 : stepClass === 'active' ? 4 : 0,
                  color: stepClass === 'pending' ? '#8a8a8a' : '#333'
                }}
                transition={{ 
                  duration: 0.4, 
                  ease: [0.25, 0.46, 0.45, 0.94],
                  delay: stepClass === 'active' ? 0.1 : 0
                }}
              >
                <span className="status-icon"></span>
                {step}
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;