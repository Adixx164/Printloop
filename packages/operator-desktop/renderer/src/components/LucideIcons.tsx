import * as LucideIcons from 'lucide-react';

interface LucideIconProps {
  name: keyof typeof LucideIcons;
  size?: number;
  className?: string;
}

export function LucideIcons({ name, size = 24, className = '' }: LucideIconProps) {
  const Icon = LucideIcons[name as keyof typeof LucideIcons];
  
  if (!Icon) {
    console.warn(`Lucide icon "${name}" not found`);
    return <LucideIcons.AlertCircle size={size} className={className} />;
  }
  
  return <Icon size={size} className={className} strokeWidth={2} />;
}

export default LucideIcons;