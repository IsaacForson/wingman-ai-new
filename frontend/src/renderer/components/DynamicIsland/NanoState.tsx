/**
 * Wingman AI - Nano State
 * Smallest state showing just a pulsing indicator
 */

import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { Mic, MicOff, WifiOff } from 'lucide-react'

const NanoState = () => {
  const { isConnected, isPaused, setIslandState } = useAppStore()

  return (
    <motion.div
      className="w-full h-full flex items-center justify-center cursor-pointer"
      onClick={() => setIslandState('mini')}
    >
      {/* Pulsing circle with icon */}
      <motion.div
        className={`
          relative w-6 h-6 rounded-full flex items-center justify-center
          ${isConnected ? 'bg-wingman-500/30' : 'bg-red-500/30'}
        `}
        animate={{
          scale: isPaused ? 1 : [1, 1.1, 1],
          opacity: isPaused ? 0.5 : [0.8, 1, 0.8]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      >
        {/* Inner glow */}
        <motion.div
          className={`
            absolute inset-0 rounded-full
            ${isConnected ? 'bg-wingman-500' : 'bg-red-500'}
          `}
          animate={{
            opacity: [0.4, 0.8, 0.4],
            scale: [0.8, 1, 0.8]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
        
        {/* Icon */}
        <motion.div
          className="relative z-10"
          animate={isPaused ? {} : { scale: [1, 1.1, 1] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          {isPaused ? (
            <MicOff className="w-3 h-3 text-white/70" />
          ) : isConnected ? (
            <Mic className="w-3 h-3 text-white" />
          ) : (
            <WifiOff className="w-3 h-3 text-white/70" />
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export default NanoState

