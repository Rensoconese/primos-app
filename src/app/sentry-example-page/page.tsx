"use client";

import { useState } from "react";

export default function SentryExamplePage() {
  const [errorTriggered, setErrorTriggered] = useState(false);

  const triggerError = () => {
    setErrorTriggered(true);
    throw new Error("This is a test error from Sentry!");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-8">
          Sentry Test Page
        </h1>
        
        <p className="text-gray-300 mb-6">
          Click the button below to trigger a test error
        </p>
        
        <button
          onClick={triggerError}
          className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Trigger Test Error
        </button>
        
        {errorTriggered && (
          <p className="text-green-400 mt-4">
            Error triggered! Check your Sentry dashboard.
          </p>
        )}
      </div>
    </div>
  );
}