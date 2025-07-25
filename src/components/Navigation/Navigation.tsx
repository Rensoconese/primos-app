'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path;
  };

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/leaderboard', label: 'Leaderboard' }
  ];

  return (
    <div className="hidden md:flex items-center space-x-4">
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive(link.href) 
              ? 'text-white bg-gray-700' 
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}