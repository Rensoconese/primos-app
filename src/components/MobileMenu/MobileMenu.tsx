'use client';

import { useState } from 'react';
import RoninWallet from '@/components/wallet-connectors/ronin-wallet/RoninWallet';

interface MobileMenuProps {
  userAddress?: string | null;
  onDisconnect?: () => void;
  onConnect?: (walletClient: any, publicClient: any) => void;
}

export default function MobileMenu({ userAddress, onDisconnect, onConnect }: MobileMenuProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={toggleMobileMenu}
        className="md:hidden p-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
        aria-label="Toggle wallet menu"
      >
        {mobileMenuOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile Menu - Only Wallet */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-gray-800 shadow-lg z-50">
          <div className="py-3 px-4">
            <div className="flex flex-col">
              {/* Mobile Wallet in Menu */}
              <div className="px-3 py-2">
                <RoninWallet onConnect={onConnect} onDisconnect={onDisconnect} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}