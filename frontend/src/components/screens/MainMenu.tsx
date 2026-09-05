import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Droplets, Sparkles, Zap, Flame, Leaf, Mountain } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { useGameContext } from '@/store/GameContext';
import { GAME_LEVEL_TOTAL, clampGameLevel } from '@/data/gameProgression';

export function MainMenu() {
  const navigate = useNavigate();
  const { progress } = useGameContext();

  return (
    <div className="h-full flex flex-col bg-dark-surface overflow-y-auto phone-scroll pb-20 ornament-pattern">
      {/* Header */}
      <div className="pt-10 pb-6 px-5">
        <div className="gold-separator mb-6" />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl font-bold text-primary tracking-[0.1em]">ТЕРМЛИНЫ</h1>
            <p className="text-white/40 text-xs mt-0.5">
              Уровень {clampGameLevel(progress.currentLevel)} из {GAME_LEVEL_TOTAL}
            </p>
          </div>
          <CurrencyDisplay amount={progress.currency} />
        </div>

        {/* Main CTA */}
        <Button size="lg" onClick={() => navigate('/map')} className="w-full">
          Начать игру
        </Button>
      </div>

      <div className="gold-separator" />

      {/* Game modes */}
      <div className="px-5 py-5 space-y-3">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wider text-primary">Режимы</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { name: 'Вода', icon: Droplets, color: '#6AABDA' },
            { name: 'Огонь', icon: Flame, color: '#D4956A' },
            { name: 'Лес', icon: Leaf, color: '#5DB879' },
          ].map(mode => (
            <motion.button
              key={mode.name}
              className="bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl p-4 text-center transition-all"
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/map')}
            >
              <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: `${mode.color}20` }}>
                <mode.icon size={22} style={{ color: mode.color }} />
              </div>
              <p className="text-white/80 text-xs font-medium">{mode.name}</p>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="gold-separator" />

      {/* Stats row */}
      <div className="px-5 py-5 grid grid-cols-3 gap-2.5">
        {[
          { label: 'Уровней', value: Object.keys(progress.levels).length, icon: Mountain },
          { label: 'Звёзд', value: Object.values(progress.levels).reduce((s, l) => s + l.stars, 0), icon: Sparkles },
          { label: 'Энергия', value: 5, icon: Zap },
        ].map(stat => (
          <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <stat.icon size={16} className="text-primary mx-auto mb-1" />
            <p className="text-white font-bold text-lg">{stat.value}</p>
            <p className="text-white/40 text-[10px]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="gold-separator" />

      {/* Quick actions */}
      <div className="px-5 py-5 space-y-2.5">
        <button
          onClick={() => navigate('/shop')}
          className="w-full bg-white/5 border border-white/10 hover:border-primary/30 rounded-xl p-4 flex items-center gap-3 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles size={18} className="text-primary" />
          </div>
          <div className="text-left flex-1">
            <p className="text-white/90 text-sm font-medium">Магазин бустеров</p>
            <p className="text-white/40 text-xs">Подсказки и усилители</p>
          </div>
          <span className="text-primary text-xs">→</span>
        </button>
      </div>
    </div>
  );
}
