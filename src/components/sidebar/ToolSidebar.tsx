import type { ReactNode } from 'react';

interface ToolSidebarProps {
  children: ReactNode;
  className?: string;
}

export function ToolSidebar({ children, className = '' }: ToolSidebarProps) {
  return (
    <aside className={`space-y-4 h-full overflow-y-auto custom-scrollbar pb-6 ${className}`}>
      {children}
    </aside>
  );
}
