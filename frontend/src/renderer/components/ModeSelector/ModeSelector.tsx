/**
 * Wingman AI - Mode Selector
 * Quick mode switching for different use cases
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Mic2, 
  GraduationCap, 
  Briefcase, 
  Users, 
  Search, 
  Target,
  ChevronDown
} from 'lucide-react'
import { useAppStore, OperatingMode } from '../../store/appStore'
import * as actions from '../../actions'

interface ModeConfig {
  id: OperatingMode
  label: string
  icon: React.ReactNode
  color: string
  description: string
}

const modes: ModeConfig[] = [
  { 
    id: 'interview', 
    label: 'Interview', 
    icon: <Mic2 className="w-4 h-4" />,
    color: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
    description: 'Structured, professional answers'
  },
  { 
    id: 'study', 
    label: 'Study', 
    icon: <GraduationCap className="w-4 h-4" />,
    color: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
    description: 'Clear explanations & examples'
  },
  { 
    id: 'work', 
    label: 'Work', 
    icon: <Briefcase className="w-4 h-4" />,
    color: 'text-green-400 bg-green-500/20 border-green-500/30',
    description: 'Concise, actionable advice'
  },
  { 
    id: 'meeting', 
    label: 'Meeting', 
    icon: <Users className="w-4 h-4" />,
    color: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
    description: 'Quick, to-the-point answers'
  },
  { 
    id: 'research', 
    label: 'Research', 
    icon: <Search className="w-4 h-4" />,
    color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
    description: 'Thorough, balanced analysis'
  },
  { 
    id: 'practice', 
    label: 'Practice', 
    icon: <Target className="w-4 h-4" />,
    color: 'text-pink-400 bg-pink-500/20 border-pink-500/30',
    description: 'Coaching & feedback'
  }
]

interface ModeSelectorProps {
  compact?: boolean
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ compact = false }) => {
  const mode = useAppStore((s) => s.mode)
  const [isOpen, setIsOpen] = useState(false)
  const [updating, setUpdating] = useState(false)

  const currentMode = modes.find(m => m.id === mode) || modes[0]

  const handleModeChange = async (newMode: OperatingMode) => {
    setIsOpen(false)
    if (newMode === mode) return
    setUpdating(true)
    await actions.setMode(newMode)
    setUpdating(false)
  }

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all
            ${currentMode.color} border
          `}
          disabled={updating}
        >
          {updating ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            currentMode.icon
          )}
          <span className="font-medium capitalize">{currentMode.label}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="absolute top-full left-0 mt-1 bg-[#1a1a2e] rounded-lg border border-white/10 shadow-xl overflow-hidden z-50 min-w-[160px]"
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              {modes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModeChange(m.id)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors
                    ${m.id === mode ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}
                  `}
                >
                  <span className={`p-1 rounded ${m.color}`}>
                    {m.icon}
                  </span>
                  <span className="capitalize">{m.label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Click outside to close */}
        {isOpen && (
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>
    )
  }

  // Full mode selector (grid layout)
  return (
    <div className="grid grid-cols-3 gap-2">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => handleModeChange(m.id)}
          className={`
            flex flex-col items-center gap-1 p-3 rounded-xl transition-all
            ${m.id === mode 
              ? `${m.color} border` 
              : 'bg-white/5 hover:bg-white/10 border border-transparent'
            }
          `}
          disabled={updating}
        >
          <span className={`p-2 rounded-lg ${m.id === mode ? '' : 'bg-white/5'}`}>
            {m.icon}
          </span>
          <span className="text-xs font-medium capitalize">{m.label}</span>
        </button>
      ))}
    </div>
  )
}

export default ModeSelector

