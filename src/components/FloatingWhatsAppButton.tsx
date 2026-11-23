import React from 'react';
import { motion } from 'motion/react';

const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb65xZMCXC3OiHIqik2a';

export const FloatingWhatsAppButton: React.FC = () => {
  return (
    <motion.a
      href={WHATSAPP_CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join FREE FIRE TOURNAMENT 09 Official WhatsApp Channel"
      title="Join Our Official WhatsApp Channel"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.08, y: -2 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-[76px] right-4 lg:bottom-6 lg:right-6 z-40 w-12 h-12 rounded-full bg-[#FACC15] hover:bg-[#FDE047] text-[#0A0E17] shadow-[0_8px_28px_rgba(250,204,21,0.45)] border border-[#FDE047]/70 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E17]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="w-6 h-6"
      >
        <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
        <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
      </svg>
    </motion.a>
  );
};
