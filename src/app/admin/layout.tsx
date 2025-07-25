import AdminGuard from '@/components/AdminGuard';
import AdminNavbar from '@/components/admin/AdminNavbar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-900">
      <AdminNavbar />
      <AdminGuard>
        {children}
      </AdminGuard>
    </div>
  );
}