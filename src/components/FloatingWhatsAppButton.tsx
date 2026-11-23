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
      className="fixed bottom-[70px] right-4 lg:bottom-6 lg:right-6 z-40 w-12 h-12 rounded-full bg-[#25D366] hover:bg-[#1EBE5D] text-white shadow-[0_8px_24px_rgba(37,211,102,0.42)] border border-white/25 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-[#04110A]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="w-6 h-6"
      >
        <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.516.078-1.172.109-1.891-.125-.438-.141-1-.328-1.719-.641-3.016-1.297-4.984-4.344-5.141-4.547-.156-.203-1.234-1.641-1.234-3.125s.781-2.219 1.063-2.516c.281-.297.609-.375.813-.375s.406 0 .578.016c.188.016.438-.078.688.516.25.609.859 2.094.938 2.25.078.156.125.344.016.547-.109.203-.156.344-.313.516-.156.172-.328.391-.469.516-.156.156-.313.328-.141.641.172.313.781 1.297 1.688 2.094 1.156 1.031 2.141 1.359 2.453 1.516.313.156.484.125.672-.078.188-.203.781-.906.984-1.219.203-.313.422-.266.703-.156.281.109 1.797.844 2.109 1s.516.234.594.359c.078.125.078.734-.172 1.438z" />
      </svg>
    </motion.a>
  );
};
