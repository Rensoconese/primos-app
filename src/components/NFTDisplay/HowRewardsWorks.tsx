'use client';

import React from 'react';

const HowRewardsWorks: React.FC = () => {
  // Get the current UTC time for display
  const nowUTC = new Date();
  const utcHours = nowUTC.getUTCHours();
  const utcMinutes = nowUTC.getUTCMinutes();
  const formattedUTCTime = `${utcHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`;
  return (
    <div className="">
      <h3 className="text-xl font-bold mb-4 uppercase">How bonuses work</h3>
      <p className="text-sm mt-2">Your Primos provide bonuses based on their rarity. By maintaining daily streaks, you'll unlock increasingly powerful multipliers.</p>
      <p className="text-sm font-semibold">NFTs Bonus x Streak Multiplier = Fire Dust Rewards</p>
      
      <div className="mt-4">
        <details className="bg-gray-700 p-3 rounded-md mb-2 shadow-sm text-white">
          <summary className="font-bold cursor-pointer flex justify-between items-center">
            <span>Daily Reset Time</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-chevron-down" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
            </svg>
          </summary>
          <div className="mt-2 p-2 bg-gray-600 rounded">
            <p className="text-sm mt-1">
              Primos and check-ins reset at <span className="font-bold">00:00 UTC</span> each day.
            </p>
            <p className="text-sm mt-1">
              Current UTC time: <span className="font-bold">{formattedUTCTime} UTC</span>
            </p>
            <p className="text-sm mt-1">
              Once a new UTC day begins, you can check in again and use your Primos for new bonuses.
            </p>
          </div>
        </details>
      
        <details className="bg-gray-700 p-3 rounded-md mb-2 shadow-sm text-white">
          <summary className="font-bold cursor-pointer flex justify-between items-center">
            <span>Primos Bonus</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-chevron-down" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
            </svg>
          </summary>
          <div className="mt-2 p-2 bg-gray-600 rounded">
            <table className="min-w-full text-sm text-white">
              <thead>
                <tr>
                  <th className="text-left p-1">Rarity</th>
                  <th className="text-left p-1">Base Bonus</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-1">Original</td>
                  <td className="p-1">+1</td>
                </tr>
                <tr>
                  <td className="p-1">Original Z</td>
                  <td className="p-1">+4</td>
                </tr>
                <tr>
                  <td className="p-1">Shiny</td>
                  <td className="p-1">+7</td>
                </tr>
                <tr>
                  <td className="p-1">Shiny Z</td>
                  <td className="p-1">+13</td>
                </tr>
                <tr>
                  <td className="p-1">Unique</td>
                  <td className="p-1">+30</td>
                </tr>
                <tr>
                  <td className="p-1">Full Set</td>
                  <td className="p-1">+2 (additional bonus)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        
        <details className="bg-gray-700 p-3 rounded-md shadow-sm text-white">
          <summary className="font-bold cursor-pointer flex justify-between items-center">
            <span>Streak Multipliers</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-chevron-down" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
            </svg>
          </summary>
          <div className="mt-2 p-2 bg-gray-600 rounded">
            <table className="min-w-full text-sm text-white">
              <thead>
                <tr>
                  <th className="text-left p-1">Streak Days</th>
                  <th className="text-left p-1">Multiplier</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-1">1-7 days</td>
                  <td className="p-1">x1.0</td>
                </tr>
                <tr>
                  <td className="p-1">8-14 days</td>
                  <td className="p-1">x1.5</td>
                </tr>
                <tr>
                  <td className="p-1">15-21 days</td>
                  <td className="p-1">x2.0</td>
                </tr>
                <tr>
                  <td className="p-1">22-28 days</td>
                  <td className="p-1">x2.5</td>
                </tr>
                <tr>
                  <td className="p-1">29+ days</td>
                  <td className="p-1">x3.0</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
};

export default HowRewardsWorks;
