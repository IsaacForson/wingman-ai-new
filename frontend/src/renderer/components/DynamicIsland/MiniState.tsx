/**
 * Wingman AI - Mini State
 * Shows listening status with waveform animation
 */

import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { Mic, Pause } from 'lucide-react'

const MiniState = () => {
  const { isListening, isPaused, setIslandState } = useAppStore()

  return (
    <motion.div
      className="w-full h-full flex items-center justify-between px-3 cursor-pointer"
      onClick={() => setIslandState('normal')}
    >
      {/* Left: Microphone icon */}
      <motion.div
        className={`
          w-7 h-7 rounded-full flex items-center justify-center
          ${isListening ? 'bg-wingman-500/30' : 'bg-white/10'}
        `}
        animate={isListening && !isPaused ? {
          scale: [1, 1.1, 1],
          boxShadow: [
            '0 0 0 0 rgba(14, 165, 233, 0.4)',
            '0 0 0 8px rgba(14, 165, 233, 0)',
            '0 0 0 0 rgba(14, 165, 233, 0)'
          ]
        } : {}}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeOut'
        }}
      >
        {isPaused ? (
          <Pause className="w-3.5 h-3.5 text-white/70" />
        ) : (
          <Mic className="w-3.5 h-3.5 text-white" />
        )}
      </motion.div>

      {/* Center: Waveform or status text */}
      <div className="flex-1 flex items-center justify-center">
        {isListening && !isPaused ? (
          <Waveform />
        ) : (
          <motion.span
            className="text-xs text-white/60 font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {isPaused ? 'Paused' : 'Ready'}
          </motion.span>
        )}
      </div>

      {/* Right: Status indicator */}
      <motion.div
        className={`
          w-2 h-2 rounded-full
          ${isListening ? 'bg-green-500' : 'bg-white/30'}
        `}
        animate={isListening ? {
          opacity: [1, 0.5, 1]
        } : {}}
        transition={{
          duration: 1,
          repeat: Infinity
        }}
      />
    </motion.div>
  )
}

// Waveform component
const Waveform = () => {
  const bars = 5
  
  return (
    <div className="flex items-center gap-0.5 h-4">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-0.5 bg-wingman-400 rounded-full"
          animate={{
            height: ['30%', '100%', '30%']
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.1
          }}
          style={{ height: '30%' }}
        />
      ))}
    </div>
  )
}

export default MiniState

