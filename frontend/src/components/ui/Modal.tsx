import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/utils/cn';

interface ModalProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, children, className }: ModalProps) {
  const content = (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className={cn(
              'relative z-10 max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-dark-surface-warm p-6 shadow-2xl',
              className,
            )}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return content;
  const appScreen = document.querySelector('.phone-screen');
  return appScreen ? createPortal(content, appScreen) : content;
}
